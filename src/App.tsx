import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  availableQuantity,
  canRemoveCatalogItem,
  canRemoveNumberedItem,
  canRemoveSoldier,
  fuzzyScore,
  holdingsForSoldier,
  issuedQuantity,
  numberedItemsForSoldier,
  soldierHasEquipment,
  soldiersWithoutEquipment,
  validateSoldierInput,
} from "./domain/rules";
import {
  canAccessMethod,
  hasAllPlatoons,
  resolveUserAccess,
  scopeCompanyData,
} from "./domain/permissions";
import { catalogKey, itemLabel, numberedItemKey } from "./domain/schema";
import {
  isValidSignature,
  MAX_SIGNATURE_POINTS,
} from "./domain/signature";
import {
  buildInventoryWhatsAppMessage,
  buildSoldierMovementsWhatsAppMessage,
  buildSoldiersWhatsAppMessage,
  shareOnWhatsApp,
} from "./domain/sharing";
import type {
  CatalogInput,
  CatalogItem,
  CompanyData,
  EquipmentStatus,
  LoadResult,
  ManagementMethod,
  MovementEntry,
  NumberedItem,
  PermissionInput,
  PermissionRecord,
  SignatureData,
  SignaturePoint,
  SignatureRecord,
  SignatureSummary,
  SigningSessionInput,
  Soldier,
  SoldierInput,
  UserAccess,
} from "./domain/types";
import {
  EQUIPMENT_SCOPES,
  EQUIPMENT_STATUSES,
  MANAGEMENT_METHODS,
} from "./domain/types";
import {
  GOOGLE_LOGIN_HINT_STORAGE_KEY,
  GOOGLE_SIGNED_IN_STORAGE_KEY,
  SPREADSHEET_STORAGE_KEY,
} from "./services/config";
import { GoogleAuthService } from "./services/googleAuth";
import { SpreadsheetRepository } from "./services/spreadsheetRepository";
import logoUrl from "./assets/logo-8208.png";
import whatsappIconUrl from "./assets/whatsapp.svg";

type View =
  "dashboard" | "signings" | "soldiers" | "inventory" | "history" | "settings";
type AppState =
  "booting" | "signed-out" | "select-sheet" | "loading" | "result" | "error";
type Action =
  | {
      kind: "numbered";
      item: NumberedItem;
      mode: "assign" | "return" | "status";
    }
  | {
      kind: "quantity";
      item: CatalogItem;
      mode: "issue" | "return" | "transfer";
      soldier?: Soldier;
    }
  | { kind: "stock"; item: CatalogItem }
  | null;
type SignatureViewerState = {
  key: string;
  summary: SignatureSummary;
  record: SignatureRecord | null;
  loading: boolean;
  error: string;
};

const auth = new GoogleAuthService();
const idFromValue = (value: string) =>
  value.trim().match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
  value.trim();
const initialSpreadsheetId = () =>
  idFromValue(
    new URL(window.location.href).searchParams.get("spid") ||
      localStorage.getItem(SPREADSHEET_STORAGE_KEY) ||
      "",
  );
const displayDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("he-IL", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
};
const statusClass = (status: EquipmentStatus) =>
  status === "זמין"
    ? "success"
    : status === "משויך"
      ? "info"
      : ["אבוד", "מושבת"].includes(status)
        ? "danger"
        : "warning";
const signatureForMovement = (
  entry: MovementEntry,
  signatures: SignatureSummary[],
) =>
  signatures.find(
    (signature) =>
      signature.timestamp === entry.timestamp &&
      (signature.personalNumber === entry.previousSoldier ||
        signature.personalNumber === entry.newSoldier),
  );

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="סגירה"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
const EmptyList = ({ children }: { children: ReactNode }) => (
  <div className="empty-list">{children}</div>
);

export function App() {
  const [appState, setAppState] = useState<AppState>("booting");
  const [spreadsheetId, setSpreadsheetId] = useState(initialSpreadsheetId);
  const [sheetInput, setSheetInput] = useState(initialSpreadsheetId);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [signedInName, setSignedInName] = useState("");
  const [soldierForm, setSoldierForm] = useState<Soldier | "new" | null>(null);
  const [catalogForm, setCatalogForm] = useState<CatalogItem | "new" | null>(
    null,
  );
  const [numberedForm, setNumberedForm] = useState<NumberedItem | "new" | null>(
    null,
  );
  const [action, setAction] = useState<Action>(null);
  const [soldierDetail, setSoldierDetail] = useState<Soldier | null>(null);
  const [catalogDetail, setCatalogDetail] = useState<CatalogItem | null>(null);
  const [movementShareSoldier, setMovementShareSoldier] =
    useState<Soldier | null>(null);
  const [signingReceipt, setSigningReceipt] = useState<{
    soldier: Soldier;
    movements: MovementEntry[];
  } | null>(null);
  const [signatureViewer, setSignatureViewer] =
    useState<SignatureViewerState | null>(null);
  const signatureCache = useRef(new Map<string, SignatureRecord>());

  const data = result?.kind === "ready" ? result.data : null;
  const access = useMemo(
    () => (data ? resolveUserAccess(data.meta.userEmail, data.permissions) : null),
    [data],
  );
  const visibleData = useMemo(() => {
    if (!data || !access) return null;
    return scopeCompanyData(data, access);
  }, [access, data]);
  useEffect(() => {
    if (view === "settings" && access && !access.admin) setView("dashboard");
  }, [access, view]);
  const repo = useMemo(
    () => (spreadsheetId ? new SpreadsheetRepository(spreadsheetId) : null),
    [spreadsheetId],
  );

  useEffect(() => {
    let cancelled = false;
    auth
      .init()
      .then(async () => {
        if (cancelled) return;
        if (
          auth.isSignedIn() ||
          localStorage.getItem(GOOGLE_SIGNED_IN_STORAGE_KEY) === "true"
        ) {
          try {
            await auth.restoreSession();
            if (cancelled) return;
            setSignedInName(auth.currentUserName());
            localStorage.setItem(GOOGLE_SIGNED_IN_STORAGE_KEY, "true");
            if (spreadsheetId) await loadSpreadsheet(spreadsheetId, cancelled);
            else setAppState("select-sheet");
            return;
          } catch {
            localStorage.removeItem(GOOGLE_SIGNED_IN_STORAGE_KEY);
          }
        }
        if (!cancelled) setAppState("signed-out");
      })
      .catch(() => {
        if (!cancelled) {
          setError("לא ניתן לטעון את שירות ההתחברות של Google");
          setAppState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn() {
    try {
      setAppState("loading");
      await auth.signIn(
        localStorage.getItem(GOOGLE_LOGIN_HINT_STORAGE_KEY) || "",
      );
      setSignedInName(auth.currentUserName());
      localStorage.setItem(GOOGLE_SIGNED_IN_STORAGE_KEY, "true");
      if (spreadsheetId) await loadSpreadsheet(spreadsheetId);
      else setAppState("select-sheet");
    } catch {
      setError("ההתחברות ל-Google נכשלה");
      setAppState("signed-out");
    }
  }

  function signOut() {
    auth.signOut();
    localStorage.removeItem(GOOGLE_SIGNED_IN_STORAGE_KEY);
    localStorage.removeItem(GOOGLE_LOGIN_HINT_STORAGE_KEY);
    setSignedInName("");
    setResult(null);
    setAppState("signed-out");
  }

  async function loadSpreadsheet(value: string, cancelled = false) {
    const id = idFromValue(value);
    if (!id) {
      setError("יש להזין מזהה או קישור לגיליון");
      setAppState("select-sheet");
      return;
    }
    try {
      setAppState("loading");
      setError("");
      const loaded = await new SpreadsheetRepository(id).inspect();
      if (cancelled) return;
      setSpreadsheetId(id);
      setSheetInput(id);
      localStorage.setItem(SPREADSHEET_STORAGE_KEY, id);
      const meta = loaded.kind === "ready" ? loaded.data.meta : loaded.meta;
      if (meta.userEmail)
        localStorage.setItem(GOOGLE_LOGIN_HINT_STORAGE_KEY, meta.userEmail);
      setSignedInName(meta.userName || auth.currentUserName());
      setResult(loaded);
      setView("dashboard");
      setAppState("result");
    } catch {
      if (!cancelled) {
        setError("אין גישה לגיליון או שלא ניתן לקרוא אותו");
        setAppState("error");
      }
    }
  }

  async function initializeSheet() {
    if (!repo || result?.kind !== "empty") return;
    if (
      !window.confirm(
        "להכין את הגיליון הריק למת״ש? הפעולה תיצור את הלשוניות והכותרות הנדרשות.",
      )
    )
      return;
    try {
      setSaving(true);
      await repo.initializeEmptyWorkbook(result.meta);
      await loadSpreadsheet(spreadsheetId);
      setNotice("הגיליון הוכן בהצלחה");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "הכנת הגיליון נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function upgradeSheetStructure() {
    if (!repo || result?.kind !== "upgradeable") return;
    if (
      !window.confirm(
        "להוסיף לגיליון את הלשוניות והעמודות החסרות? נתונים קיימים לא יימחקו או יועברו.",
      )
    )
      return;
    try {
      setSaving(true);
      setError("");
      await repo.applyAdditiveSchemaUpgrade(result.meta);
      await loadSpreadsheet(spreadsheetId);
      setNotice("מבנה הגיליון עודכן בהצלחה");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "עדכון המבנה נכשל");
    } finally {
      setSaving(false);
    }
  }

  async function mutate(
    operation: (
      current: CompanyData,
      repository: SpreadsheetRepository,
    ) => Promise<void>,
    success: string,
  ) {
    if (!data || !repo || !data.meta.editable || saving) return false;
    try {
      setSaving(true);
      setError("");
      setNotice("");
      const fresh = await repo.inspect();
      if (fresh.kind !== "ready") {
        throw new Error("מבנה הגיליון השתנה. יש לטעון אותו מחדש.");
      }
      await operation(fresh.data, repo);
      const refreshed = await repo.inspect();
      if (refreshed.kind !== "ready") {
        throw new Error("השמירה בוצעה, אך קריאת הנתונים המעודכנים נכשלה.");
      }
      setResult(refreshed);
      setNotice(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "השמירה נכשלה");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function openSignature(summary: SignatureSummary) {
    if (!repo) return;
    const key = `${spreadsheetId}:${summary.row}:${summary.timestamp}:${summary.personalNumber}`;
    const cached = signatureCache.current.get(key);
    if (cached) {
      setSignatureViewer({
        key,
        summary,
        record: cached,
        loading: false,
        error: "",
      });
      return;
    }
    setSignatureViewer({ key, summary, record: null, loading: true, error: "" });
    try {
      if (!data) throw new Error("הנתונים אינם זמינים.");
      const record = await repo.loadSignatureRecord(data, summary);
      signatureCache.current.set(key, record);
      setSignatureViewer((current) =>
        current?.key === key
          ? { ...current, record, loading: false, error: "" }
          : current,
      );
    } catch (cause) {
      setSignatureViewer((current) =>
        current?.key === key
          ? {
              ...current,
              loading: false,
              error:
                cause instanceof Error
                  ? cause.message
                  : "טעינת החתימה נכשלה",
            }
          : current,
      );
    }
  }

  if (appState === "booting" || appState === "loading")
    return <Splash text="טוען…" />;
  if (appState === "signed-out")
    return <Welcome error={error} onSignIn={() => void signIn()} />;
  if (appState === "select-sheet")
    return (
      <SheetPicker
        value={sheetInput}
        setValue={setSheetInput}
        error={error}
        onSubmit={(event) => {
          event.preventDefault();
          void loadSpreadsheet(sheetInput);
        }}
        onSignOut={signOut}
      />
    );
  if (appState === "error")
    return (
      <ShellHeader name={signedInName} onSignOut={signOut}>
        <main className="center-card">
          <h2>לא ניתן לפתוח את הגיליון</h2>
          <p>{error}</p>
          <button
            className="primary-button"
            onClick={() => setAppState("select-sheet")}
          >
            בחירת גיליון
          </button>
        </main>
      </ShellHeader>
    );
  if (!result) return null;
  if (result.kind === "empty")
    return (
      <ShellHeader name={signedInName} onSignOut={signOut}>
        <main className="center-card">
          <h2>הגיליון ריק</h2>
          <p>ניתן להכין אותו כמערכת מת״ש חדשה.</p>
          {result.meta.editable ? (
            <button
              className="primary-button"
              disabled={saving}
              onClick={() => void initializeSheet()}
            >
              הכנת הגיליון למת״ש
            </button>
          ) : (
            <p className="read-only-banner">
              נדרשת הרשאת עריכה כדי להכין את הגיליון.
            </p>
          )}
          <button
            className="text-button"
            onClick={() => setAppState("select-sheet")}
          >
            בחירת גיליון אחר
          </button>
        </main>
      </ShellHeader>
    );
  if (result.kind === "upgradeable")
    return (
      <ShellHeader name={signedInName} onSignOut={signOut}>
        <main className="center-card">
          <h2>נדרש עדכון קטן במבנה הגיליון</h2>
          <p>
            ניתן להשלים את המבנה על ידי הוספת לשוניות או עמודות בלבד. נתונים
            קיימים לא יימחקו או יועברו.
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <ul>
            {result.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          {result.meta.editable ? (
            <button
              className="primary-button"
              disabled={saving}
              onClick={() => void upgradeSheetStructure()}
            >
              {saving ? "מעדכן…" : "השלמת מבנה הגיליון"}
            </button>
          ) : (
            <p className="read-only-banner">
              נדרשת הרשאת עריכה כדי להשלים את מבנה הגיליון.
            </p>
          )}
          <button
            className="text-button"
            onClick={() => setAppState("select-sheet")}
          >
            בחירת גיליון אחר
          </button>
        </main>
      </ShellHeader>
    );
  if (result.kind === "incompatible")
    return (
      <ShellHeader name={signedInName} onSignOut={signOut}>
        <main className="center-card">
          <h2>מבנה הגיליון אינו תואם למת״ש</h2>
          <p>לא בוצעו שינויים.</p>
          <ul>
            {result.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <button
            className="text-button"
            onClick={() => setAppState("select-sheet")}
          >
            בחירת גיליון אחר
          </button>
        </main>
      </ShellHeader>
    );
  if (!data || !visibleData || !access) return null;
  const operationData: CompanyData = {
    ...visibleData,
    holdings: data.holdings,
  };

  return (
    <div className="app-shell" dir="rtl">
      <header className="topbar">
        <div className="brand">
          <img src={logoUrl} alt="" />
          <div>
            <strong>מת״ש</strong>
            <small>ניהול ציוד פלוגתי · {data.meta.title}</small>
          </div>
        </div>
        <div className="user-area">
          {saving && (
            <span className="save-indicator" role="status">
              שומר…
            </span>
          )}
          <span>{signedInName || data.meta.userName}</span>
          <button className="text-button" onClick={signOut}>
            יציאה
          </button>
        </div>
      </header>
      {!data.meta.editable && (
        <div className="read-only-banner">
          הגיליון פתוח לקריאה בלבד. פעולות עריכה אינן זמינות.
        </div>
      )}
      {(error || notice) && (
        <div className={error ? "alert error" : "alert success"}>
          {error || notice}
          <button
            onClick={() => {
              setError("");
              setNotice("");
            }}
            aria-label="סגירה"
          >
            ×
          </button>
        </div>
      )}
      <main className="content">
        {view === "dashboard" && (
          <Dashboard
            data={visibleData}
            editable={data.meta.editable}
            access={access}
            onView={setView}
            onAddSoldier={() => setSoldierForm("new")}
            onAddNumbered={() => setNumberedForm("new")}
            onIssue={() => setView("signings")}
          />
        )}
        {view === "soldiers" && (
          <SoldiersView
            data={visibleData}
            editable={data.meta.editable}
            onAdd={() => setSoldierForm("new")}
            onEdit={setSoldierForm}
            onOpen={setSoldierDetail}
            onToggle={(soldier) => {
              const issue = soldier.active
                ? canRemoveSoldier(soldier, data.numberedItems, data.holdings)
                : null;
              if (issue) return setError(issue);
              if (
                window.confirm(
                  soldier.active ? "להסיר את החייל?" : "להפעיל מחדש את החייל?",
                )
              )
                void mutate(
                  (current, repository) =>
                    repository.setSoldierActive(
                      current,
                      soldier,
                      !soldier.active,
                    ),
                  soldier.active ? "החייל הוסר" : "החייל הופעל",
                );
            }}
          />
        )}
        {view === "signings" && (
          <SigningsView
            data={operationData}
            editable={data.meta.editable}
            saving={saving}
            onSave={async (soldier, input) => {
              let movements: MovementEntry[] = [];
              const ok = await mutate(async (current, repository) => {
                movements = await repository.saveSigningSession(
                  current,
                  soldier,
                  input,
                );
              }, "ההחתמה נשמרה");
              if (ok) setSigningReceipt({ soldier, movements });
              return ok;
            }}
          />
        )}
        {view === "inventory" && (
          <InventoryView
            data={visibleData}
            stockHoldings={data.holdings}
            editable={data.meta.editable}
            access={access}
            onAddCatalog={() => setCatalogForm("new")}
            onAddNumbered={() => setNumberedForm("new")}
            onCatalog={setCatalogDetail}
            onCatalogEdit={setCatalogForm}
            onNumberedEdit={setNumberedForm}
            onAction={setAction}
            onCatalogToggle={(item) => {
              const issue = item.active
                ? canRemoveCatalogItem(item, data.numberedItems, data.holdings)
                : null;
              if (issue) return setError(issue);
              if (
                window.confirm(
                  item.active
                    ? "להסיר את סוג הציוד?"
                    : "להפעיל מחדש את סוג הציוד?",
                )
              )
                void mutate(
                  (current, repository) =>
                    repository.setCatalogActive(current, item, !item.active),
                  item.active ? "סוג הציוד הוסר" : "סוג הציוד הופעל",
                );
            }}
            onNumberedToggle={(item) => {
              const issue = item.active ? canRemoveNumberedItem(item) : null;
              if (issue) return setError(issue);
              if (
                window.confirm(
                  item.active ? "להסיר את הפריט?" : "להפעיל מחדש את הפריט?",
                )
              )
                void mutate(
                  (current, repository) =>
                    repository.setNumberedItemActive(
                      current,
                      item,
                      !item.active,
                    ),
                  item.active ? "הפריט הוסר" : "הפריט הופעל",
                );
            }}
          />
        )}
        {view === "history" && (
          <HistoryView data={visibleData} onSignature={openSignature} />
        )}
        {view === "settings" && access.admin && (
          <SettingsView
            data={data}
            editable={data.meta.editable}
            onSave={(platoons) =>
              void mutate(
                (current, repository) =>
                  repository.saveSettings(current, {
                    platoons,
                    schemaVersion: data.settings.schemaVersion,
                  }),
                "המחלקות נשמרו",
              )
            }
            onSavePermissions={(permissions) =>
              void mutate(
                (current, repository) =>
                  repository.savePermissions(current, permissions),
                "ההרשאות נשמרו",
              )
            }
          />
        )}
      </main>
      <nav className="bottom-nav" aria-label="ניווט ראשי">
        {(
          [
            ["dashboard", "בית"],
            ["signings", "החתמות"],
            ["soldiers", "חיילים"],
            ["inventory", "מלאי"],
            ["history", "תנועות"],
            ["settings", "הגדרות"],
          ] as const
        )
          .filter(([id]) => id !== "settings" || access.admin)
          .map(([id, label]) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            {label}
          </button>
          ))}
      </nav>

      {soldierForm && (
        <SoldierFormModal
          data={visibleData}
          soldier={soldierForm === "new" ? undefined : soldierForm}
          saving={saving}
          onClose={() => setSoldierForm(null)}
          onSave={async (input) => {
            const ok = await mutate(
              (current, repository) =>
                soldierForm === "new"
                  ? repository.addSoldier(current, input)
                  : repository.editSoldier(current, soldierForm, input),
              soldierForm === "new" ? "החייל נוסף" : "פרטי החייל נשמרו",
            );
            if (ok) setSoldierForm(null);
          }}
        />
      )}
      {catalogForm &&
        hasAllPlatoons(access) &&
        (catalogForm === "new" ||
          canAccessMethod(access, catalogForm.method)) && (
        <CatalogFormModal
          data={visibleData}
          item={catalogForm === "new" ? undefined : catalogForm}
          allowedMethods={MANAGEMENT_METHODS.filter((method) =>
            canAccessMethod(access, method),
          )}
          canManageStock={canAccessMethod(access, "כמותי")}
          saving={saving}
          onClose={() => setCatalogForm(null)}
          onSave={async (input) => {
            const ok = await mutate(
              (current, repository) =>
                catalogForm === "new"
                  ? repository.addCatalogItem(current, input)
                  : repository.editCatalogItem(current, catalogForm, input),
              catalogForm === "new" ? "סוג הציוד נוסף" : "סוג הציוד נשמר",
            );
            if (ok) setCatalogForm(null);
          }}
        />
      )}
      {numberedForm &&
        canAccessMethod(access, "צל״מ") &&
        (numberedForm === "new" || hasAllPlatoons(access)) && (
        <NumberedFormModal
          data={operationData}
          item={numberedForm === "new" ? undefined : numberedForm}
          saving={saving}
          onClose={() => setNumberedForm(null)}
          onSave={async (type, variant, number, note) => {
            const input = {
              type,
              variant,
              number,
              status: "זמין" as const,
              note,
            };
            const ok = await mutate(
              (current, repository) =>
                numberedForm === "new"
                  ? repository.addNumberedItem(current, input)
                  : repository.editNumberedItem(current, numberedForm, input),
              numberedForm === "new" ? "הפריט נוסף" : "הפריט נשמר",
            );
            if (ok) setNumberedForm(null);
          }}
        />
      )}
      {action && (
        <ActionModal
          data={data}
          action={action}
          saving={saving}
          onClose={() => setAction(null)}
          onSubmit={async (values) => {
            let ok = false;
            let shareRecipient: Soldier | null = null;
            if (action.kind === "numbered") {
              if (action.mode === "assign") {
                const soldier = visibleData.soldiers.find(
                  (candidate) => candidate.personalNumber === values.soldier,
                );
                if (soldier)
                  ok = await mutate(
                    (current, repository) =>
                      repository.assignNumbered(
                        current,
                        action.item,
                        soldier,
                        values.note,
                      ),
                    action.item.assignedTo ? "הפריט הועבר" : "הפריט הוחתם",
                  );
                if (ok && soldier) shareRecipient = soldier;
              }
              if (action.mode === "return")
                ok = await mutate(
                  (current, repository) =>
                    repository.returnNumbered(
                      current,
                      action.item,
                      values.note,
                    ),
                  "הפריט הוחזר",
                );
              if (action.mode === "status")
                ok = await mutate(
                  (current, repository) =>
                    repository.changeNumberedStatus(
                      current,
                      action.item,
                      values.status as EquipmentStatus,
                      values.note,
                    ),
                  "הסטטוס עודכן",
                );
            } else if (action.kind === "stock")
              ok = await mutate(
                (current, repository) =>
                  repository.adjustStock(
                    current,
                    action.item,
                    Number(values.quantity),
                    values.note,
                  ),
                "המלאי עודכן",
              );
            else {
              const soldier =
                action.soldier ||
                visibleData.soldiers.find(
                  (candidate) => candidate.personalNumber === values.soldier,
                );
              const target = visibleData.soldiers.find(
                (candidate) => candidate.personalNumber === values.target,
              );
              if (action.mode === "issue" && soldier)
                ok = await mutate(
                  (current, repository) =>
                    repository.issueQuantity(
                      current,
                      action.item,
                      soldier,
                      Number(values.quantity),
                      values.note,
                    ),
                  "הציוד הוחתם",
                );
              if (ok && action.mode === "issue" && soldier)
                shareRecipient = soldier;
              if (action.mode === "return" && soldier)
                ok = await mutate(
                  (current, repository) =>
                    repository.returnQuantity(
                      current,
                      action.item,
                      soldier,
                      Number(values.quantity),
                      values.note,
                    ),
                  "הציוד הוחזר",
                );
              if (action.mode === "transfer" && soldier && target)
                ok = await mutate(
                  (current, repository) =>
                    repository.transferQuantity(
                      current,
                      action.item,
                      soldier,
                      target,
                      Number(values.quantity),
                      values.note,
                    ),
                  "הציוד הועבר",
                );
              if (ok && action.mode === "transfer" && target)
                shareRecipient = target;
            }
            if (ok) {
              setAction(null);
              setSoldierDetail(null);
              setCatalogDetail(null);
              if (shareRecipient) setMovementShareSoldier(shareRecipient);
            }
          }}
        />
      )}
      {soldierDetail && (
        <SoldierDetail
          data={visibleData}
          soldier={soldierDetail}
          editable={data.meta.editable}
          onClose={() => setSoldierDetail(null)}
          onNumbered={(item, mode) =>
            setAction({ kind: "numbered", item, mode })
          }
          onQuantity={(item, mode) =>
            setAction({ kind: "quantity", item, soldier: soldierDetail, mode })
          }
          onShare={() => setMovementShareSoldier(soldierDetail)}
          onSignature={openSignature}
        />
      )}
      {movementShareSoldier && (
        <MovementShareModal
          data={visibleData}
          soldier={movementShareSoldier}
          onClose={() => setMovementShareSoldier(null)}
        />
      )}
      {signingReceipt && (
        <SigningReceiptModal
          receipt={signingReceipt}
          onClose={() => setSigningReceipt(null)}
        />
      )}
      {signatureViewer && (
        <SignatureViewerModal
          state={signatureViewer}
          onClose={() => setSignatureViewer(null)}
          onRetry={() => void openSignature(signatureViewer.summary)}
        />
      )}
      {catalogDetail && (
        <CatalogDetail
          data={visibleData}
          stockHoldings={data.holdings}
          item={catalogDetail}
          editable={data.meta.editable}
          canManageStock={
            canAccessMethod(access, "כמותי") && hasAllPlatoons(access)
          }
          onClose={() => setCatalogDetail(null)}
          onAction={setAction}
        />
      )}
    </div>
  );
}

function ShellHeader({
  name,
  onSignOut,
  children,
}: {
  name: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="welcome" dir="rtl">
      <header className="topbar">
        <div className="brand">
          <img src={logoUrl} alt="" />
          <div>
            <strong>מת״ש</strong>
            <small>ניהול ציוד פלוגתי</small>
          </div>
        </div>
        <div className="user-area">
          <span>{name}</span>
          <button className="text-button" onClick={onSignOut}>
            יציאה
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
function Splash({ text }: { text: string }) {
  return (
    <div className="splash" dir="rtl">
      <img src={logoUrl} alt="" />
      <h1>מת״ש</h1>
      <p className="product-subtitle">ניהול ציוד פלוגתי</p>
      <p>{text}</p>
    </div>
  );
}
function Welcome({ error, onSignIn }: { error: string; onSignIn: () => void }) {
  return (
    <div className="welcome" dir="rtl">
      <div className="welcome-card">
        <img src={logoUrl} alt="" />
        <h1>מת״ש</h1>
        <p>ניהול ציוד פלוגתי</p>
        {error && <p className="form-error">{error}</p>}
        <button className="google-button" onClick={onSignIn}>
          התחברות עם Google
        </button>
      </div>
    </div>
  );
}
function SheetPicker({
  value,
  setValue,
  error,
  onSubmit,
  onSignOut,
}: {
  value: string;
  setValue: (value: string) => void;
  error: string;
  onSubmit: (event: FormEvent) => void;
  onSignOut: () => void;
}) {
  return (
    <ShellHeader name={auth.currentUserName()} onSignOut={onSignOut}>
      <form className="center-card" onSubmit={onSubmit}>
        <h2>בחירת גיליון</h2>
        <p>הדביקו קישור לגיליון Google Sheets או את המזהה שלו.</p>
        <Field label="קישור או מזהה">
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            dir="ltr"
          />
        </Field>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button">פתיחת הגיליון</button>
      </form>
    </ShellHeader>
  );
}

function Dashboard({
  data,
  editable,
  access,
  onView,
  onAddSoldier,
  onAddNumbered,
  onIssue,
}: {
  data: CompanyData;
  editable: boolean;
  access: UserAccess;
  onView: (view: View) => void;
  onAddSoldier: () => void;
  onAddNumbered: () => void;
  onIssue: () => void;
}) {
  const activeNumbered = data.numberedItems.filter((item) => item.active);
  const quantityTotal = data.catalog
    .filter((item) => item.active && item.method === "כמותי")
    .reduce((sum, item) => sum + item.totalStock, 0);
  const quantityIssued = data.holdings.reduce(
    (sum, holding) => sum + holding.quantity,
    0,
  );
  const cards = [
    ["פריטי צל״מ", activeNumbered.length],
    ["צל״מ משויך", activeNumbered.filter((item) => item.assignedTo).length],
    [
      "צל״מ זמין",
      activeNumbered.filter((item) => item.status === "זמין").length,
    ],
    ["יחידות כמותיות", quantityTotal],
    ["יחידות מוחזקות", quantityIssued],
    [
      "תקול / בתיקון",
      activeNumbered.filter((item) => ["תקול", "בתיקון"].includes(item.status))
        .length,
    ],
    ["אבוד", activeNumbered.filter((item) => item.status === "אבוד").length],
    [
      "חיילים ללא ציוד",
      soldiersWithoutEquipment(data.soldiers, data.numberedItems, data.holdings)
        .length,
    ],
  ];
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>תמונת מצב</h1>
          <p>המצב הנוכחי של הציוד הפלוגתי</p>
        </div>
      </div>
      <div className="stats-grid">
        {cards.map(([label, value]) => (
          <article className="stat-card" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
      {editable && (
        <div className="quick-actions">
          <button className="primary-button" onClick={onIssue}>
            החתמת ציוד
          </button>
          <button className="secondary-button" onClick={onAddSoldier}>
            הוספת חייל
          </button>
          {canAccessMethod(access, "צל״מ") && (
            <button className="secondary-button" onClick={onAddNumbered}>
              הוספת פריט צל״מ
            </button>
          )}
        </div>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>פעילות אחרונה</h2>
          <button className="text-button" onClick={() => onView("history")}>
            לכל התנועות
          </button>
        </div>
        {data.movements.length ? (
          <div className="activity-list">
            {[...data.movements]
              .reverse()
              .slice(0, 8)
              .map((entry) => (
                <div key={entry.row}>
                  <strong>{entry.action}</strong>
                  <span>
                    {itemLabel(entry.type, entry.variant)} {entry.number}{" "}
                    {entry.quantity ? `× ${entry.quantity}` : ""}
                  </span>
                  <small>{displayDate(entry.timestamp)}</small>
                </div>
              ))}
          </div>
        ) : (
          <EmptyList>אין עדיין פעילות.</EmptyList>
        )}
      </section>
    </section>
  );
}

function SoldiersView({
  data,
  editable,
  onAdd,
  onEdit,
  onOpen,
  onToggle,
}: {
  data: CompanyData;
  editable: boolean;
  onAdd: () => void;
  onEdit: (soldier: Soldier) => void;
  onOpen: (soldier: Soldier) => void;
  onToggle: (soldier: Soldier) => void;
}) {
  const [query, setQuery] = useState("");
  const [platoon, setPlatoon] = useState("");
  const [equipmentState, setEquipmentState] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const filtered = data.soldiers.filter(
    (soldier) =>
      (showArchived || soldier.active) &&
      (!platoon || soldier.platoon === platoon) &&
      (!query ||
        `${soldier.name} ${soldier.personalNumber} ${soldier.phone}`.includes(
          query.trim(),
        )) &&
      (!equipmentState ||
        (equipmentState === "assigned") ===
          soldierHasEquipment(soldier, data.numberedItems, data.holdings)),
  );
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>חיילים</h1>
          <p>{filtered.length} תוצאות</p>
        </div>
        <div className="heading-actions">
          <button
            className="icon-button share-button"
            title="שיתוף ב-WhatsApp"
            aria-label="שיתוף רשימת החיילים ב-WhatsApp"
            onClick={() =>
              shareOnWhatsApp(
                buildSoldiersWhatsAppMessage(data, filtered, {
                  query,
                  platoon,
                  equipmentState,
                  showArchived,
                }),
              )
            }
          >
            <img src={whatsappIconUrl} alt="" />
          </button>
          {editable && (
            <button className="primary-button" onClick={onAdd}>
              הוספת חייל
            </button>
          )}
        </div>
      </div>
      <div className="filters">
        <input
          placeholder="חיפוש שם, מספר אישי או טלפון"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          value={platoon}
          onChange={(event) => setPlatoon(event.target.value)}
        >
          <option value="">כל המחלקות</option>
          {data.settings.platoons.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          value={equipmentState}
          onChange={(event) => setEquipmentState(event.target.value)}
        >
          <option value="">עם וללא ציוד</option>
          <option value="assigned">עם ציוד</option>
          <option value="none">ללא ציוד</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          כולל שהוסרו
        </label>
      </div>
      <div className="cards-list">
        {filtered.map((soldier) => {
          const numbered = numberedItemsForSoldier(
            data.numberedItems,
            soldier.personalNumber,
          );
          const quantities = holdingsForSoldier(
            data.holdings,
            soldier.personalNumber,
          );
          return (
            <article
              className={`list-card ${soldier.active ? "" : "archived"}`}
              key={soldier.personalNumber}
              onClick={() => onOpen(soldier)}
            >
              <div>
                <h3>{soldier.name}</h3>
                <p>
                  <bdi>{soldier.personalNumber}</bdi> · מחלקה {soldier.platoon}
                </p>
                {soldier.phone && (
                  <small>
                    טלפון: <bdi>{soldier.phone}</bdi>
                  </small>
                )}
                <small>
                  {numbered.length} פריטי צל״מ ·{" "}
                  {quantities.reduce(
                    (sum, holding) => sum + holding.quantity,
                    0,
                  )}{" "}
                  יחידות כמותיות
                </small>
              </div>
              {editable && (
                <div
                  className="card-actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    className="small-button"
                    onClick={() => onEdit(soldier)}
                  >
                    עריכה
                  </button>
                  <button
                    className="small-button danger-text"
                    onClick={() => onToggle(soldier)}
                  >
                    {soldier.active ? "הסרה" : "הפעלה"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!filtered.length && <EmptyList>לא נמצאו חיילים.</EmptyList>}
      </div>
    </section>
  );
}

function SigningsView({
  data,
  editable,
  saving,
  onSave,
}: {
  data: CompanyData;
  editable: boolean;
  saving: boolean;
  onSave: (soldier: Soldier, input: SigningSessionInput) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [selectedSoldier, setSelectedSoldier] = useState<Soldier | null>(null);
  const [selectedNumbered, setSelectedNumbered] = useState<Set<string>>(
    new Set(),
  );
  const [quantityValues, setQuantityValues] = useState<Record<string, number>>(
    {},
  );
  const [numberedToAdd, setNumberedToAdd] = useState("");
  const [quantityToAdd, setQuantityToAdd] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [pendingSigning, setPendingSigning] = useState<Omit<
    SigningSessionInput,
    "signature"
  > | null>(null);

  const soldierMatches = useMemo(
    () =>
      data.soldiers
        .filter((soldier) => soldier.active)
        .map((soldier) => ({
          soldier,
          score: fuzzyScore(
            `${soldier.name} ${soldier.personalNumber} ${soldier.phone} ${soldier.platoon}`,
            query,
          ),
        }))
        .filter((match) => match.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.soldier.name.localeCompare(right.soldier.name, "he"),
        )
        .slice(0, 12),
    [data.soldiers, query],
  );

  useEffect(() => {
    if (!selectedSoldier) {
      setSelectedNumbered(new Set());
      setQuantityValues({});
      return;
    }
    setSelectedNumbered(
      new Set(
        data.numberedItems
          .filter(
            (item) =>
              item.active && item.assignedTo === selectedSoldier.personalNumber,
          )
          .map((item) => numberedItemKey(item.type, item.number)),
      ),
    );
    setQuantityValues(
      Object.fromEntries(
        data.holdings
          .filter(
            (holding) =>
              holding.personalNumber === selectedSoldier.personalNumber &&
              holding.quantity > 0,
          )
          .map((holding) => [
            catalogKey(holding.type, holding.variant),
            holding.quantity,
          ]),
      ),
    );
    setNumberedToAdd("");
    setQuantityToAdd("");
    setAddQuantity(1);
  }, [data, selectedSoldier]);

  if (!selectedSoldier) {
    return (
      <section>
        <div className="page-heading">
          <div>
            <h1>החתמות</h1>
            <p>בחירת חייל ועריכת כל הציוד החתום עליו בפעולה אחת</p>
          </div>
        </div>
        <section className="panel soldier-picker">
          <Field label="חיפוש חייל">
            <input
              autoFocus
              placeholder="שם, מספר אישי, טלפון או מחלקה"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
          <div className="cards-list compact search-results">
            {soldierMatches.map(({ soldier }) => (
              <button
                type="button"
                className="soldier-result"
                key={soldier.personalNumber}
                onClick={() => setSelectedSoldier(soldier)}
              >
                <strong>{soldier.name}</strong>
                <span>
                  <bdi>{soldier.personalNumber}</bdi> · מחלקה {soldier.platoon}
                </span>
              </button>
            ))}
            {!soldierMatches.length && <EmptyList>לא נמצאו חיילים.</EmptyList>}
          </div>
        </section>
      </section>
    );
  }

  const currentNumbered = data.numberedItems.filter(
    (item) => item.active && item.assignedTo === selectedSoldier.personalNumber,
  );
  const selectedNumberedItems = data.numberedItems.filter((item) =>
    selectedNumbered.has(numberedItemKey(item.type, item.number)),
  );
  const availableNumbered = data.numberedItems.filter(
    (item) =>
      item.active &&
      item.status === "זמין" &&
      !item.assignedTo &&
      !selectedNumbered.has(numberedItemKey(item.type, item.number)),
  );
  const quantityCatalog = data.catalog.filter(
    (item) => item.active && item.method === "כמותי",
  );
  const currentQuantity = (item: CatalogItem) =>
    data.holdings.find(
      (holding) =>
        holding.personalNumber === selectedSoldier.personalNumber &&
        catalogKey(holding.type, holding.variant) ===
          catalogKey(item.type, item.variant),
    )?.quantity || 0;
  const numberedToAssign = selectedNumberedItems.filter(
    (item) => item.assignedTo !== selectedSoldier.personalNumber,
  );
  const numberedToReturn = currentNumbered.filter(
    (item) => !selectedNumbered.has(numberedItemKey(item.type, item.number)),
  );
  const quantityTargets = quantityCatalog
    .map((item) => ({
      item,
      quantity: quantityValues[catalogKey(item.type, item.variant)] || 0,
    }))
    .filter((target) => target.quantity !== currentQuantity(target.item));
  const changeCount =
    numberedToAssign.length + numberedToReturn.length + quantityTargets.length;
  const displayedQuantityItems = quantityCatalog.filter(
    (item) => (quantityValues[catalogKey(item.type, item.variant)] || 0) > 0,
  );
  const quantityAddItem = quantityCatalog.find(
    (item) => catalogKey(item.type, item.variant) === quantityToAdd,
  );

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>החתמה — {selectedSoldier.name}</h1>
          <p>
            <bdi>{selectedSoldier.personalNumber}</bdi> · מחלקה{" "}
            {selectedSoldier.platoon}
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setSelectedSoldier(null);
            setQuery("");
          }}
        >
          החלפת חייל
        </button>
      </div>

      <section className="panel">
        <h2>ציוד חתום</h2>
        <div className="cards-list compact">
          {selectedNumberedItems.map((item) => (
            <article
              className="list-card"
              key={numberedItemKey(item.type, item.number)}
            >
              <div>
                <strong>
                  {itemLabel(item.type, item.variant)} · {item.number}
                </strong>
                <p>צל״מ</p>
              </div>
              {editable && (
                <button
                  type="button"
                  className="small-button danger-text"
                  onClick={() => {
                    const next = new Set(selectedNumbered);
                    next.delete(numberedItemKey(item.type, item.number));
                    setSelectedNumbered(next);
                  }}
                >
                  הסרה
                </button>
              )}
            </article>
          ))}
          {displayedQuantityItems.map((item) => {
            const key = catalogKey(item.type, item.variant);
            return (
              <article className="list-card" key={key}>
                <div>
                  <strong>
                    {itemLabel(item.type, item.variant, item.variantLabel)}
                  </strong>
                  <p>כמותי</p>
                </div>
                {editable && (
                  <div className="quantity-editor">
                    <input
                      aria-label={`כמות ${itemLabel(item.type, item.variant, item.variantLabel)}`}
                      type="number"
                      min="0"
                      max={
                        currentQuantity(item) +
                        availableQuantity(item, data.holdings)
                      }
                      step="1"
                      value={quantityValues[key] || 0}
                      onChange={(event) =>
                        setQuantityValues((current) => ({
                          ...current,
                          [key]: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="small-button danger-text"
                      onClick={() =>
                        setQuantityValues((current) => ({
                          ...current,
                          [key]: 0,
                        }))
                      }
                    >
                      הסרה
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {!selectedNumberedItems.length && !displayedQuantityItems.length && (
            <EmptyList>אין ציוד חתום לחייל.</EmptyList>
          )}
        </div>
      </section>

      {editable && (
        <section className="panel signing-add-panel">
          <h2>הוספת ציוד</h2>
          <div className="signing-add-grid">
            <div>
              <Field label="פריט צל״מ זמין">
                <select
                  value={numberedToAdd}
                  onChange={(event) => setNumberedToAdd(event.target.value)}
                >
                  <option value="">בחירה</option>
                  {availableNumbered.map((item) => {
                    const key = numberedItemKey(item.type, item.number);
                    return (
                      <option key={key} value={key}>
                        {itemLabel(item.type, item.variant)} · {item.number}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <button
                type="button"
                className="secondary-button"
                disabled={!numberedToAdd}
                onClick={() => {
                  setSelectedNumbered(
                    (current) => new Set([...current, numberedToAdd]),
                  );
                  setNumberedToAdd("");
                }}
              >
                הוספה להחתמה
              </button>
            </div>
            <div>
              <Field label="ציוד כמותי">
                <select
                  value={quantityToAdd}
                  onChange={(event) => setQuantityToAdd(event.target.value)}
                >
                  <option value="">בחירה</option>
                  {quantityCatalog.map((item) => {
                    const key = catalogKey(item.type, item.variant);
                    return (
                      <option key={key} value={key}>
                        {itemLabel(item.type, item.variant, item.variantLabel)}{" "}
                        · זמין {availableQuantity(item, data.holdings)}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label="כמות להוספה">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={addQuantity}
                  onChange={(event) =>
                    setAddQuantity(Math.max(1, Number(event.target.value) || 1))
                  }
                />
              </Field>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  !quantityAddItem ||
                  availableQuantity(quantityAddItem, data.holdings) <= 0
                }
                onClick={() => {
                  if (!quantityAddItem) return;
                  const maximum =
                    currentQuantity(quantityAddItem) +
                    availableQuantity(quantityAddItem, data.holdings);
                  setQuantityValues((current) => ({
                    ...current,
                    [quantityToAdd]: Math.min(
                      maximum,
                      (current[quantityToAdd] || 0) + addQuantity,
                    ),
                  }));
                  setQuantityToAdd("");
                  setAddQuantity(1);
                }}
              >
                הוספה להחתמה
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="signing-save-bar">
        <span>
          {changeCount
            ? `${changeCount} שינויים ממתינים`
            : "אין שינויים לשמירה"}
        </span>
        <button
          className="primary-button"
          disabled={!editable || saving || !changeCount}
          onClick={() =>
            setPendingSigning({
              numberedToAssign,
              numberedToReturn,
              quantityTargets,
            })
          }
        >
          שמירת ההחתמה
        </button>
      </div>
      {pendingSigning && (
        <SignatureModal
          soldier={selectedSoldier}
          changeCount={changeCount}
          saving={saving}
          onClose={() => setPendingSigning(null)}
          onConfirm={async (signature) => {
            const saved = await onSave(selectedSoldier, {
              ...pendingSigning,
              signature,
            });
            if (saved) setPendingSigning(null);
          }}
        />
      )}
    </section>
  );
}

function InventoryView({
  data,
  stockHoldings,
  editable,
  access,
  onAddCatalog,
  onAddNumbered,
  onCatalog,
  onCatalogEdit,
  onNumberedEdit,
  onAction,
  onCatalogToggle,
  onNumberedToggle,
}: {
  data: CompanyData;
  stockHoldings: CompanyData["holdings"];
  editable: boolean;
  access: UserAccess;
  onAddCatalog: () => void;
  onAddNumbered: () => void;
  onCatalog: (item: CatalogItem) => void;
  onCatalogEdit: (item: CatalogItem) => void;
  onNumberedEdit: (item: NumberedItem) => void;
  onAction: (action: Action) => void;
  onCatalogToggle: (item: CatalogItem) => void;
  onNumberedToggle: (item: NumberedItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [platoon, setPlatoon] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const canManageInventory = hasAllPlatoons(access);
  const holderMatches = (personalNumber: string) =>
    !platoon ||
    data.soldiers.find((soldier) => soldier.personalNumber === personalNumber)
      ?.platoon === platoon;
  const numbered = data.numberedItems.filter(
    (item) =>
      (showArchived || item.active) &&
      (!type || item.type === type) &&
      (!method || method === "צל״מ") &&
      (!status || item.status === status) &&
      (!platoon || holderMatches(item.assignedTo)) &&
      (!query ||
        `${item.type} ${item.variant} ${item.number}`.includes(query.trim())),
  );
  const quantity = data.catalog.filter(
    (item) =>
      item.method === "כמותי" &&
      (showArchived || item.active) &&
      (!type || item.type === type) &&
      (!method || method === "כמותי") &&
      !status &&
      (!query || `${item.type} ${item.variant}`.includes(query.trim())) &&
      (!platoon ||
        data.holdings.some(
          (holding) =>
            holding.type === item.type &&
            holding.variant === item.variant &&
            holderMatches(holding.personalNumber),
        )),
  );
  const filters = { query, type, method, status, platoon, showArchived };
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>מלאי ציוד</h1>
          <p>
            {numbered.length} פריטי צל״מ · {quantity.length} סוגים כמותיים
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="icon-button share-button"
            title="שיתוף ב-WhatsApp"
            aria-label="שיתוף מלאי הציוד ב-WhatsApp"
            onClick={() =>
              shareOnWhatsApp(
                buildInventoryWhatsAppMessage(
                  data,
                  numbered,
                  quantity,
                  filters,
                ),
              )
            }
          >
            <img src={whatsappIconUrl} alt="" />
          </button>
          {editable && (
            <>
              {canManageInventory && (
                <button className="secondary-button" onClick={onAddCatalog}>
                  סוג ציוד חדש
                </button>
              )}
              {canAccessMethod(access, "צל״מ") && (
                <button className="primary-button" onClick={onAddNumbered}>
                  פריט צל״מ חדש
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="filters">
        <input
          placeholder="חיפוש סוג, מאפיין או מספר"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          <option value="">כל שיטות הניהול</option>
          {MANAGEMENT_METHODS.filter((value) =>
            canAccessMethod(access, value),
          ).map((value) => (
              <option key={value}>{value}</option>
            ))}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">כל הסוגים</option>
          {[...new Set(data.catalog.map((item) => item.type))].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">כל הסטטוסים</option>
          {EQUIPMENT_STATUSES.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          value={platoon}
          onChange={(event) => setPlatoon(event.target.value)}
        >
          <option value="">כל המחלקות</option>
          {data.settings.platoons.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          כולל שהוסרו
        </label>
      </div>
      <div className="cards-list">
        {numbered.map((item) => {
          const holder = data.soldiers.find(
            (soldier) => soldier.personalNumber === item.assignedTo,
          );
          return (
            <article
              className={`list-card ${item.active ? "" : "archived"}`}
              key={`${item.type}-${item.number}`}
            >
              <div>
                <h3>
                  {itemLabel(item.type, item.variant)} ·{" "}
                  <bdi>{item.number}</bdi>
                </h3>
                <p>
                  {holder
                    ? `${holder.name} · מחלקה ${holder.platoon}`
                    : "לא משויך"}
                </p>
                <span className={`status ${statusClass(item.status)}`}>
                  {item.status}
                </span>
              </div>
              {editable && (
                <div className="card-actions">
                  <button
                    className="small-button"
                    onClick={() =>
                      onAction({ kind: "numbered", item, mode: "assign" })
                    }
                  >
                    {item.assignedTo ? "העברה" : "החתמה"}
                  </button>
                  {item.assignedTo && (
                    <button
                      className="small-button"
                      onClick={() =>
                        onAction({ kind: "numbered", item, mode: "return" })
                      }
                    >
                      החזרה
                    </button>
                  )}
                  <button
                    className="small-button"
                    onClick={() =>
                      onAction({ kind: "numbered", item, mode: "status" })
                    }
                  >
                    סטטוס
                  </button>
                  {canManageInventory && (
                    <>
                      <button
                        className="small-button"
                        onClick={() => onNumberedEdit(item)}
                      >
                        עריכה
                      </button>
                      <button
                        className="small-button danger-text"
                        onClick={() => onNumberedToggle(item)}
                      >
                        {item.active ? "הסר" : "הפעל"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {quantity.map((item) => (
          <article
            className={`list-card quantity-card ${item.active ? "" : "archived"}`}
            key={catalogKey(item.type, item.variant)}
            onClick={() => onCatalog(item)}
          >
            <div>
              <h3>{itemLabel(item.type, item.variant, item.variantLabel)}</h3>
              <p>כמותי</p>
              <div className="inventory-numbers">
                <span>
                  מלאי <strong>{item.totalStock}</strong>
                </span>
                <span>
                  מוחזק <strong>{issuedQuantity(item, stockHoldings)}</strong>
                </span>
                <span>
                  זמין <strong>{availableQuantity(item, stockHoldings)}</strong>
                </span>
              </div>
            </div>
            {editable && (
              <div
                className="card-actions"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="small-button"
                  onClick={() =>
                    onAction({ kind: "quantity", item, mode: "issue" })
                  }
                >
                  החתמה
                </button>
                {canManageInventory && (
                  <>
                    <button
                      className="small-button"
                      onClick={() => onAction({ kind: "stock", item })}
                    >
                      עדכון מלאי
                    </button>
                    <button
                      className="small-button"
                      onClick={() => onCatalogEdit(item)}
                    >
                      עריכה
                    </button>
                    <button
                      className="small-button danger-text"
                      onClick={() => onCatalogToggle(item)}
                    >
                      {item.active ? "הסר" : "הפעל"}
                    </button>
                  </>
                )}
              </div>
            )}
          </article>
        ))}
        {!numbered.length && !quantity.length && (
          <EmptyList>לא נמצא ציוד.</EmptyList>
        )}
      </div>
    </section>
  );
}

function HistoryView({
  data,
  onSignature,
}: {
  data: CompanyData;
  onSignature: (signature: SignatureSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("");
  const [action, setAction] = useState("");
  const [type, setType] = useState("");
  const [platoon, setPlatoon] = useState("");
  const [actor, setActor] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const rows = [...data.movements].reverse().filter((entry) => {
    const relatedSoldiers = data.soldiers.filter(
      (soldier) =>
        soldier.personalNumber === entry.previousSoldier ||
        soldier.personalNumber === entry.newSoldier,
    );
    const timestamp = new Date(entry.timestamp).getTime();
    const searchable = `${entry.action} ${entry.type} ${entry.variant} ${entry.number} ${entry.previousSoldier} ${entry.newSoldier} ${entry.actor} ${entry.note} ${relatedSoldiers.map((soldier) => soldier.name).join(" ")}`;
    return (
      (!method || entry.method === method) &&
      (!action || entry.action === action) &&
      (!type || entry.type === type) &&
      (!actor || entry.actor === actor) &&
      (!platoon ||
        relatedSoldiers.some((soldier) => soldier.platoon === platoon)) &&
      (!fromDate || timestamp >= new Date(`${fromDate}T00:00:00`).getTime()) &&
      (!toDate || timestamp <= new Date(`${toDate}T23:59:59`).getTime()) &&
      (!query || searchable.includes(query.trim()))
    );
  });
  type SigningHistoryGroup = {
    kind: "signing";
    signature: SignatureSummary;
    entries: MovementEntry[];
  };
  const displayRows: Array<
    { kind: "movement"; entry: MovementEntry } | SigningHistoryGroup
  > = [];
  const signingGroups = new Map<number, SigningHistoryGroup>();
  rows.forEach((entry) => {
    const signature = signatureForMovement(entry, data.signatures);
    if (!signature) {
      displayRows.push({ kind: "movement", entry });
      return;
    }
    const existing = signingGroups.get(signature.row);
    if (existing) {
      existing.entries.push(entry);
      return;
    }
    const group: SigningHistoryGroup = {
      kind: "signing",
      signature,
      entries: [entry],
    };
    signingGroups.set(signature.row, group);
    displayRows.push(group);
  });
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>תנועות</h1>
          <p>היסטוריה מלאה; המצב הנוכחי נשמר בטבלאות המלאי</p>
        </div>
      </div>
      <div className="filters">
        <input
          placeholder="חיפוש בתנועות"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          <option value="">כל שיטות הניהול</option>
          {MANAGEMENT_METHODS.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          value={action}
          onChange={(event) => setAction(event.target.value)}
        >
          <option value="">כל הפעולות</option>
          {[...new Set(data.movements.map((entry) => entry.action))]
            .filter(Boolean)
            .map((value) => (
              <option key={value}>{value}</option>
            ))}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">כל סוגי הציוד</option>
          {[...new Set(data.movements.map((entry) => entry.type))]
            .filter(Boolean)
            .map((value) => (
              <option key={value}>{value}</option>
            ))}
        </select>
        <select
          value={platoon}
          onChange={(event) => setPlatoon(event.target.value)}
        >
          <option value="">כל המחלקות</option>
          {data.settings.platoons.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          value={actor}
          onChange={(event) => setActor(event.target.value)}
        >
          <option value="">כל מבצעי הפעולה</option>
          {[...new Set(data.movements.map((entry) => entry.actor))]
            .filter(Boolean)
            .map((value) => (
              <option key={value}>{value}</option>
            ))}
        </select>
        <Field label="מתאריך">
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </Field>
        <Field label="עד תאריך">
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </Field>
      </div>
      <div className="history-list">
        {displayRows.map((row) => {
          if (row.kind === "signing")
            return (
              <article
                className="signing-history-card"
                key={`signature-${row.signature.row}`}
              >
                <div className="history-card-heading">
                  <div>
                    <strong>פעולת החתמה · {row.signature.soldierName}</strong>
                    <small>
                      {displayDate(row.signature.timestamp)} ·{" "}
                      {row.signature.actor}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => onSignature(row.signature)}
                  >
                    הצגת חתימה
                  </button>
                </div>
                <div className="session-change-list">
                  {row.entries.map((entry) => (
                    <span key={entry.row}>
                      {entry.action} · {itemLabel(entry.type, entry.variant)}{" "}
                      {entry.number && `· ${entry.number}`} {" "}
                      {entry.quantity > 0 && `· כמות ${entry.quantity}`}
                    </span>
                  ))}
                </div>
              </article>
            );
          const { entry } = row;
          return (
            <article key={entry.row}>
              <div>
                <strong>{entry.action}</strong>
                {entry.type && (
                  <>
                    {" · "}
                    <span>
                      {itemLabel(entry.type, entry.variant)}{" "}
                      {entry.number && `· ${entry.number}`} {" "}
                      {entry.quantity > 0 && `· כמות ${entry.quantity}`}
                    </span>
                  </>
                )}
              </div>
              <p>
                {entry.previousSoldier && `מ־${entry.previousSoldier}`} {" "}
                {entry.newSoldier && `ל־${entry.newSoldier}`} {" "}
                {entry.note && `· ${entry.note}`}
              </p>
              <small>
                {displayDate(entry.timestamp)} · {entry.actor}
              </small>
            </article>
          );
        })}
        {!displayRows.length && <EmptyList>לא נמצאו תנועות.</EmptyList>}
      </div>
    </section>
  );
}

function SettingsView({
  data,
  editable,
  onSave,
  onSavePermissions,
}: {
  data: CompanyData;
  editable: boolean;
  onSave: (values: string[]) => void;
  onSavePermissions: (permissions: PermissionInput[]) => void;
}) {
  const [text, setText] = useState(data.settings.platoons.join("\n"));
  const [permissionForm, setPermissionForm] = useState<
    PermissionRecord | "new" | null
  >(null);
  const permissionInputs = (records: PermissionRecord[]): PermissionInput[] =>
    records.map(({ email, admin, equipmentScope, platoons }) => ({
      email,
      admin,
      equipmentScope,
      platoons,
    }));
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>הגדרות</h1>
          <p>ניהול מחלקות והרשאות</p>
        </div>
      </div>
      <section className="panel">
        <h2>מחלקות</h2>
        <Field label="מחלקה בכל שורה">
          <textarea
            rows={6}
            value={text}
            disabled={!editable}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        {editable && (
          <button
            className="primary-button"
            onClick={() => onSave(text.split("\n"))}
          >
            שמירת מחלקות
          </button>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>הרשאות משתמשים</h2>
            <p>משתמש ללא הגדרה מקבל גישה לכל המחלקות ולכל סוגי הציוד.</p>
          </div>
          {editable && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setPermissionForm("new")}
            >
              הוספת משתמש
            </button>
          )}
        </div>
        <div className="cards-list compact">
          {data.permissions.map((permission) => (
            <article className="list-card" key={permission.email}>
              <div>
                <strong dir="ltr">{permission.email}</strong>
                <p>
                  {permission.admin
                    ? "מנהל · כל הציוד וכל המחלקות"
                    : `${permission.equipmentScope} · ${
                        permission.platoons.length
                          ? `מחלקות ${permission.platoons.join(", ")}`
                          : "כל המחלקות"
                      }`}
                </p>
              </div>
              {editable && (
                <div className="card-actions">
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => setPermissionForm(permission)}
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    className="small-button danger-text"
                    onClick={() => {
                      if (
                        window.confirm(
                          "להסיר את הגדרת המשתמש? ללא הגדרה תהיה לו גישה תפעולית מלאה כברירת מחדל.",
                        )
                      )
                        onSavePermissions(
                          permissionInputs(
                            data.permissions.filter(
                              (candidate) =>
                                candidate.email !== permission.email,
                            ),
                          ),
                        );
                    }}
                  >
                    הסרה
                  </button>
                </div>
              )}
            </article>
          ))}
          {!data.permissions.length && (
            <EmptyList>
              אין הגדרות הרשאה. יש להוסיף מנהל ראשון ידנית בלשונית הרשאות.
            </EmptyList>
          )}
        </div>
      </section>
      {permissionForm && (
        <PermissionFormModal
          permission={permissionForm === "new" ? undefined : permissionForm}
          platoons={data.settings.platoons}
          onClose={() => setPermissionForm(null)}
          onSave={(input) => {
            const records =
              permissionForm === "new"
                ? [...permissionInputs(data.permissions), input]
                : permissionInputs(data.permissions).map((permission) =>
                    permission.email === permissionForm.email
                      ? input
                      : permission,
                  );
            onSavePermissions(records);
            setPermissionForm(null);
          }}
        />
      )}
    </section>
  );
}

function PermissionFormModal({
  permission,
  platoons,
  onClose,
  onSave,
}: {
  permission?: PermissionRecord;
  platoons: string[];
  onClose: () => void;
  onSave: (permission: PermissionInput) => void;
}) {
  const [email, setEmail] = useState(permission?.email || "");
  const [admin, setAdmin] = useState(permission?.admin || false);
  const [equipmentScope, setEquipmentScope] = useState<
    PermissionInput["equipmentScope"]
  >(
    permission?.equipmentScope || "הכל",
  );
  const [selectedPlatoons, setSelectedPlatoons] = useState(
    new Set(permission?.platoons || []),
  );
  return (
    <Modal
      title={permission ? "עריכת הרשאה" : "הוספת הרשאה"}
      onClose={onClose}
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            email,
            admin,
            equipmentScope: admin ? "הכל" : equipmentScope,
            platoons: admin ? [] : [...selectedPlatoons],
          });
        }}
      >
        <Field label="אימייל Google">
          <input
            required
            type="email"
            dir="ltr"
            disabled={Boolean(permission)}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="היקף ציוד">
          <select
            disabled={admin}
            value={equipmentScope}
            onChange={(event) =>
              setEquipmentScope(
                event.target.value as PermissionInput["equipmentScope"],
              )
            }
          >
            {EQUIPMENT_SCOPES.map((scope) => (
              <option key={scope}>{scope}</option>
            ))}
          </select>
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={admin}
            onChange={(event) => setAdmin(event.target.checked)}
          />
          מנהל
        </label>
        <fieldset className="permission-platoons" disabled={admin}>
          <legend>מחלקות — ללא בחירה פירושו כל המחלקות</legend>
          {platoons.map((platoon) => (
            <label className="check" key={platoon}>
              <input
                type="checkbox"
                checked={selectedPlatoons.has(platoon)}
                onChange={(event) => {
                  const next = new Set(selectedPlatoons);
                  if (event.target.checked) next.add(platoon);
                  else next.delete(platoon);
                  setSelectedPlatoons(next);
                }}
              />
              {platoon}
            </label>
          ))}
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button className="primary-button">שמירה</button>
        </div>
      </form>
    </Modal>
  );
}

function SoldierFormModal({
  data,
  soldier,
  saving,
  onClose,
  onSave,
}: {
  data: CompanyData;
  soldier?: Soldier;
  saving: boolean;
  onClose: () => void;
  onSave: (input: SoldierInput) => void;
}) {
  const [name, setName] = useState(soldier?.name || "");
  const [personalNumber, setPersonalNumber] = useState(
    soldier?.personalNumber || "",
  );
  const [platoon, setPlatoon] = useState(soldier?.platoon || "");
  const [phone, setPhone] = useState(soldier?.phone || "");
  const [formError, setFormError] = useState("");
  return (
    <Modal title={soldier ? "עריכת חייל" : "הוספת חייל"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const input = { name, personalNumber, platoon, phone };
          const errors = validateSoldierInput(
            input,
            data.soldiers,
            soldier?.personalNumber,
          );
          if (errors.length) {
            setFormError(errors[0]);
            return;
          }
          setFormError("");
          onSave(input);
        }}
      >
        <Field label="שם מלא">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="מספר אישי">
          <input
            required
            dir="ltr"
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={Boolean(soldier)}
            value={personalNumber}
            onChange={(event) =>
              setPersonalNumber(event.target.value.replace(/\D/g, ""))
            }
          />
        </Field>
        <Field label="מחלקה">
          <select
            required
            value={platoon}
            onChange={(event) => setPlatoon(event.target.value)}
          >
            <option value="">בחירה</option>
            {data.settings.platoons.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label="טלפון (אופציונלי)">
          <input
            type="tel"
            dir="ltr"
            inputMode="tel"
            placeholder="למשל 050-1234567"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button className="primary-button" disabled={saving}>
            שמירה
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CatalogFormModal({
  data,
  item,
  allowedMethods,
  canManageStock,
  saving,
  onClose,
  onSave,
}: {
  data: CompanyData;
  item?: CatalogItem;
  allowedMethods: ManagementMethod[];
  canManageStock: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (input: CatalogInput) => void;
}) {
  const [type, setType] = useState(item?.type || "");
  const [variant, setVariant] = useState(item?.variant || "");
  const [variantLabel, setVariantLabel] = useState(item?.variantLabel || "");
  const [method, setMethod] = useState(
    item?.method || allowedMethods[0] || "צל״מ",
  );
  const [stock, setStock] = useState(String(item?.totalStock || 0));
  const [note, setNote] = useState(item?.note || "");
  return (
    <Modal title={item ? "עריכת סוג ציוד" : "סוג ציוד חדש"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            type,
            variant,
            variantLabel,
            method,
            totalStock: Number(stock),
            note,
          });
        }}
      >
        <Field label="סוג">
          <input
            required
            disabled={Boolean(item)}
            value={type}
            onChange={(event) => setType(event.target.value)}
          />
        </Field>
        <Field label="שם מאפיין (אופציונלי)">
          <input
            placeholder="למשל מידה או דגם"
            value={variantLabel}
            onChange={(event) => setVariantLabel(event.target.value)}
          />
        </Field>
        <Field label="ערך מאפיין (אופציונלי)">
          <input
            disabled={Boolean(item)}
            placeholder="למשל M או 42"
            value={variant}
            onChange={(event) => setVariant(event.target.value)}
          />
        </Field>
        <p className="form-hint">
          אם לסוג הציוד אין מידה, דגם או פרט נוסף — משאירים את שני השדות ריקים.
        </p>
        <Field label="שיטת ניהול">
          <select
            disabled={Boolean(item)}
            value={method}
            onChange={(event) =>
              setMethod(event.target.value as "צל״מ" | "כמותי")
            }
          >
            {allowedMethods.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        {method === "כמותי" && canManageStock && (
          <Field label="מלאי התחלתי">
            <input
              type="number"
              min="0"
              step="1"
              disabled={Boolean(item)}
              value={stock}
              onChange={(event) => setStock(event.target.value)}
            />
          </Field>
        )}
        <Field label="הערה">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button className="primary-button" disabled={saving}>
            שמירה
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NumberedFormModal({
  data,
  item,
  saving,
  onClose,
  onSave,
}: {
  data: CompanyData;
  item?: NumberedItem;
  saving: boolean;
  onClose: () => void;
  onSave: (type: string, variant: string, number: string, note: string) => void;
}) {
  const options = data.catalog.filter(
    (candidate) => candidate.active && candidate.method === "צל״מ",
  );
  const [key, setKey] = useState(
    item ? catalogKey(item.type, item.variant) : "",
  );
  const [number, setNumber] = useState(item?.number || "");
  const [note, setNote] = useState(item?.note || "");
  return (
    <Modal title={item ? "עריכת פריט צל״מ" : "פריט צל״מ חדש"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const selected = options.find(
            (candidate) =>
              catalogKey(candidate.type, candidate.variant) === key,
          );
          if (selected) onSave(selected.type, selected.variant, number, note);
        }}
      >
        <Field label="סוג ופרט נוסף">
          <select
            required
            disabled={Boolean(item)}
            value={key}
            onChange={(event) => setKey(event.target.value)}
          >
            <option value="">בחירה</option>
            {options.map((option) => (
              <option
                key={catalogKey(option.type, option.variant)}
                value={catalogKey(option.type, option.variant)}
              >
                {itemLabel(option.type, option.variant, option.variantLabel)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="מספר מזהה">
          <input
            required
            dir="ltr"
            disabled={Boolean(item)}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
        </Field>
        <Field label="הערה">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        {!options.length && (
          <p className="form-error">יש ליצור קודם סוג צל״מ בקטלוג.</p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button
            className="primary-button"
            disabled={saving || !options.length}
          >
            שמירה
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ActionModal({
  data,
  action,
  saving,
  onClose,
  onSubmit,
}: {
  data: CompanyData;
  action: Exclude<Action, null>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: {
    soldier: string;
    target: string;
    quantity: string;
    status: string;
    note: string;
  }) => void;
}) {
  const activeSoldiers = data.soldiers.filter((soldier) => soldier.active);
  const [soldier, setSoldier] = useState("");
  const [target, setTarget] = useState("");
  const [quantity, setQuantity] = useState(
    action.kind === "stock" ? String(action.item.totalStock) : "1",
  );
  const [status, setStatus] = useState(
    action.kind === "numbered" ? action.item.status : "",
  );
  const [note, setNote] = useState("");
  const needsSoldier =
    (action.kind === "numbered" && action.mode === "assign") ||
    (action.kind === "quantity" && action.mode === "issue" && !action.soldier);
  const title =
    action.kind === "stock"
      ? "עדכון מלאי כולל"
      : action.mode === "assign" || action.mode === "issue"
        ? "החתמת ציוד"
        : action.mode === "transfer"
          ? "העברת ציוד"
          : action.mode === "status"
            ? "שינוי סטטוס"
            : "החזרת ציוד";
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ soldier, target, quantity, status, note });
        }}
      >
        {needsSoldier && (
          <Field label="חייל">
            <select
              required
              value={soldier}
              onChange={(event) => setSoldier(event.target.value)}
            >
              <option value="">בחירה</option>
              {activeSoldiers
                .filter(
                  (candidate) =>
                    action.kind !== "numbered" ||
                    candidate.personalNumber !== action.item.assignedTo,
                )
                .map((candidate) => (
                  <option
                    key={candidate.personalNumber}
                    value={candidate.personalNumber}
                  >
                    {candidate.name} · {candidate.personalNumber}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {action.kind === "quantity" && action.mode === "transfer" && (
          <Field label="העברה אל">
            <select
              required
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">בחירה</option>
              {activeSoldiers
                .filter(
                  (candidate) =>
                    candidate.personalNumber !== action.soldier?.personalNumber,
                )
                .map((candidate) => (
                  <option
                    key={candidate.personalNumber}
                    value={candidate.personalNumber}
                  >
                    {candidate.name} · {candidate.personalNumber}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {action.kind === "quantity" && (
          <Field label="כמות">
            <input
              type="number"
              required
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
        )}
        {action.kind === "stock" && (
          <Field label="מלאי כולל חדש">
            <input
              type="number"
              required
              min="0"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
        )}
        {action.kind === "numbered" && action.mode === "status" && (
          <Field label="סטטוס">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {EQUIPMENT_STATUSES.filter(
                (value) => !action.item.assignedTo || value === "משויך",
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="הערה">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button className="primary-button" disabled={saving}>
            אישור
          </button>
        </div>
      </form>
    </Modal>
  );
}

function drawSignature(
  canvas: HTMLCanvasElement,
  strokes: SignaturePoint[][],
) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.strokeStyle = "#173b45";
  context.fillStyle = "#173b45";
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (!stroke.length) return;
    context.beginPath();
    context.moveTo(stroke[0][0] * rect.width, stroke[0][1] * rect.height);
    if (stroke.length === 1) {
      context.arc(
        stroke[0][0] * rect.width,
        stroke[0][1] * rect.height,
        1.2,
        0,
        Math.PI * 2,
      );
      context.fill();
      return;
    }
    stroke.slice(1).forEach((point) =>
      context.lineTo(point[0] * rect.width, point[1] * rect.height),
    );
    context.stroke();
  });
}

function SignatureCanvas({
  onChange,
}: {
  onChange: (signature: SignatureData) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<SignaturePoint[][]>([]);
  const activePointerRef = useRef<number | null>(null);
  const strokeStartRef = useRef(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawSignature(canvas, strokesRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    redraw();
    return () => observer.disconnect();
  }, [redraw]);

  const pointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): SignaturePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return [
      Number(clamp((event.clientX - rect.left) / rect.width).toFixed(4)),
      Number(clamp((event.clientY - rect.top) / rect.height).toFixed(4)),
      Math.max(0, Math.round(performance.now() - strokeStartRef.current)),
    ];
  };

  const appendPoint = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): void => {
    const stroke = strokesRef.current.at(-1);
    if (!stroke) return;
    const total = strokesRef.current.reduce(
      (count, current) => count + current.length,
      0,
    );
    if (total >= MAX_SIGNATURE_POINTS) return;
    const point = pointFromEvent(event);
    const previous = stroke.at(-1);
    if (
      previous &&
      Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 0.002
    )
      return;
    stroke.push(point);
    redraw();
  };

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    appendPoint(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    activePointerRef.current = null;
    onChange({
      version: 1,
      strokes: strokesRef.current.map((stroke) => [...stroke]),
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className="signature-canvas"
      aria-label="אזור חתימה באצבע"
      onPointerDown={(event) => {
        event.preventDefault();
        if (activePointerRef.current !== null) return;
        activePointerRef.current = event.pointerId;
        strokeStartRef.current = performance.now();
        event.currentTarget.setPointerCapture(event.pointerId);
        strokesRef.current.push([]);
        appendPoint(event);
      }}
      onPointerMove={(event) => {
        if (activePointerRef.current !== event.pointerId) return;
        event.preventDefault();
        appendPoint(event);
      }}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
  );
}

function SignatureModal({
  soldier,
  changeCount,
  saving,
  onClose,
  onConfirm,
}: {
  soldier: Soldier;
  changeCount: number;
  saving: boolean;
  onClose: () => void;
  onConfirm: (signature: SignatureData) => Promise<void>;
}) {
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const valid = signature !== null && isValidSignature(signature);
  const guardedClose = () => {
    if (!saving) onClose();
  };

  return (
    <Modal title="חתימת החייל" onClose={guardedClose}>
      <p className="signature-explanation">
        {soldier.name}, מספר אישי <bdi>{soldier.personalNumber}</bdi>, מאשר/ת
        את {changeCount} השינויים בהחתמה זו.
      </p>
      <p className="signature-instruction">יש לחתום באצבע בתוך המסגרת.</p>
      <SignatureCanvas key={canvasKey} onChange={setSignature} />
      <div className="signature-status" aria-live="polite">
        {valid ? "החתימה נקלטה" : "נדרשת חתימה מלאה לפני השמירה"}
      </div>
      <div className="modal-actions signature-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={saving}
          onClick={guardedClose}
        >
          ביטול
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={saving || !signature}
          onClick={() => {
            setSignature(null);
            setCanvasKey((current) => current + 1);
          }}
        >
          נקה חתימה
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={saving || !valid}
          onClick={() => signature && void onConfirm(signature)}
        >
          {saving ? "שומר..." : "אישור ושמירת ההחתמה"}
        </button>
      </div>
    </Modal>
  );
}

function SignaturePreview({ signature }: { signature: SignatureData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => drawSignature(canvas, signature.strokes);
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    redraw();
    return () => observer.disconnect();
  }, [signature]);
  return (
    <canvas
      ref={canvasRef}
      className="signature-canvas signature-preview"
      role="img"
      aria-label="חתימת החייל"
    />
  );
}

function SignatureViewerModal({
  state,
  onClose,
  onRetry,
}: {
  state: SignatureViewerState;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Modal title="פרטי החתימה" onClose={onClose}>
      {state.loading && <div className="empty-list">טוען חתימה…</div>}
      {state.error && (
        <div className="signature-load-error">
          <div className="alert error" role="alert">
            {state.error}
          </div>
          <button type="button" className="secondary-button" onClick={onRetry}>
            ניסיון נוסף
          </button>
        </div>
      )}
      {state.record && (
        <>
          <div className="signature-metadata">
            <strong>{state.record.soldierName}</strong>
            <span>
              מספר אישי <bdi>{state.record.personalNumber}</bdi>
            </span>
            <span>{displayDate(state.record.timestamp)}</span>
            <span>בוצע על ידי {state.record.actor || "לא צוין"}</span>
          </div>
          <SignaturePreview signature={state.record.signature} />
          <h3>השינויים שאושרו</h3>
          <div className="history-list signature-change-list">
            {state.record.snapshot.changes.map((change, index) => (
              <article key={`${change.type}-${change.number}-${index}`}>
                <strong>{change.action}</strong>
                <span>
                  {itemLabel(change.type, change.variant)}{" "}
                  {change.number && `· ${change.number}`} {" "}
                  {change.quantity > 0 && `· כמות ${change.quantity}`}
                </span>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          סגירה
        </button>
      </div>
    </Modal>
  );
}

function SigningReceiptModal({
  receipt,
  onClose,
}: {
  receipt: { soldier: Soldier; movements: MovementEntry[] };
  onClose: () => void;
}) {
  const { soldier, movements } = receipt;
  const message = buildSoldierMovementsWhatsAppMessage(
    soldier,
    movements,
    "ההחתמה הנוכחית",
  );
  return (
    <Modal title="ההחתמה נשמרה" onClose={onClose}>
      <p>
        כל השינויים נשמרו. ניתן לשלוח ל{soldier.name} אישור הכולל בדיוק את
        הפריטים ששונו בפעולה הזאת.
      </p>
      <div className="history-list share-preview">
        {movements.map((entry, index) => (
          <article key={`${entry.timestamp}-${index}`}>
            <strong>{entry.action}</strong>
            <span>
              {itemLabel(entry.type, entry.variant)} {entry.number}
              {entry.quantity > 0 && ` · כמות ${entry.quantity}`}
            </span>
            <small>בוצע על ידי {entry.actor || "לא צוין"}</small>
          </article>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          סגירה
        </button>
        <button
          type="button"
          className="primary-button whatsapp-send-button"
          onClick={() => shareOnWhatsApp(message, soldier.phone)}
        >
          <img src={whatsappIconUrl} alt="" />
          פתיחה ב-WhatsApp
        </button>
      </div>
    </Modal>
  );
}

function MovementShareModal({
  data,
  soldier,
  onClose,
}: {
  data: CompanyData;
  soldier: Soldier;
  onClose: () => void;
}) {
  const now = new Date();
  const initialFrom = new Date(now.getTime() - 10 * 60 * 1000);
  const toInputValue = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };
  const [from, setFrom] = useState(toInputValue(initialFrom));
  const [to, setTo] = useState(toInputValue(now));
  const [preset, setPreset] = useState<"10m" | "today" | "custom">("10m");
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();
  const validRange = Number.isFinite(fromTime) && Number.isFinite(toTime);
  const movements = data.movements
    .filter((entry) => {
      const timestamp = new Date(entry.timestamp).getTime();
      return (
        Boolean(entry.method) &&
        (entry.previousSoldier === soldier.personalNumber ||
          entry.newSoldier === soldier.personalNumber) &&
        validRange &&
        timestamp >= fromTime &&
        timestamp <= toTime
      );
    })
    .sort(
      (left, right) =>
        new Date(left.timestamp).getTime() -
        new Date(right.timestamp).getTime(),
    );
  const rangeLabel = validRange
    ? `${displayDate(new Date(from).toISOString())}–${displayDate(new Date(to).toISOString())}`
    : "טווח לא תקין";

  function selectLastTenMinutes() {
    const end = new Date();
    setPreset("10m");
    setFrom(toInputValue(new Date(end.getTime() - 10 * 60 * 1000)));
    setTo(toInputValue(end));
  }

  function selectToday() {
    const end = new Date();
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    setPreset("today");
    setFrom(toInputValue(start));
    setTo(toInputValue(end));
  }

  return (
    <Modal title={`שיתוף תנועות — ${soldier.name}`} onClose={onClose}>
      <p>
        {soldier.phone
          ? `ההודעה תיפתח מוכנה לשליחה למספר ${soldier.phone}.`
          : "לא הוגדר טלפון לחייל. לאחר פתיחת WhatsApp יש לבחור איש קשר."}
      </p>
      <div className="range-presets" role="group" aria-label="בחירת טווח זמן">
        <button
          type="button"
          className={preset === "10m" ? "primary-button" : "secondary-button"}
          onClick={selectLastTenMinutes}
        >
          10 דקות אחרונות
        </button>
        <button
          type="button"
          className={preset === "today" ? "primary-button" : "secondary-button"}
          onClick={selectToday}
        >
          היום
        </button>
        <button
          type="button"
          className={
            preset === "custom" ? "primary-button" : "secondary-button"
          }
          onClick={() => setPreset("custom")}
        >
          טווח מותאם
        </button>
      </div>
      <div className="date-range-fields">
        <Field label="מתאריך ושעה">
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => {
              setPreset("custom");
              setFrom(event.target.value);
            }}
          />
        </Field>
        <Field label="עד תאריך ושעה">
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => {
              setPreset("custom");
              setTo(event.target.value);
            }}
          />
        </Field>
      </div>
      <p className="movement-count">
        {movements.length
          ? `${movements.length} תנועות ייכללו בהודעה.`
          : "לא נמצאו תנועות ציוד בטווח שנבחר."}
      </p>
      <div className="history-list share-preview">
        {movements.map((entry) => (
          <article key={entry.row}>
            <strong>{entry.action}</strong>
            <span>
              {itemLabel(entry.type, entry.variant)} {entry.number}
              {entry.quantity > 0 && ` · כמות ${entry.quantity}`}
            </span>
            <small>
              {displayDate(entry.timestamp)} · בוצע על ידי{" "}
              {entry.actor || "לא צוין"}
            </small>
          </article>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          ביטול
        </button>
        <button
          type="button"
          className="primary-button whatsapp-send-button"
          disabled={!movements.length || !validRange || fromTime > toTime}
          onClick={() =>
            shareOnWhatsApp(
              buildSoldierMovementsWhatsAppMessage(
                soldier,
                movements,
                rangeLabel,
              ),
              soldier.phone,
            )
          }
        >
          <img src={whatsappIconUrl} alt="" />
          פתיחה ב-WhatsApp
        </button>
      </div>
    </Modal>
  );
}

function SoldierDetail({
  data,
  soldier,
  editable,
  onClose,
  onNumbered,
  onQuantity,
  onShare,
  onSignature,
}: {
  data: CompanyData;
  soldier: Soldier;
  editable: boolean;
  onClose: () => void;
  onNumbered: (
    item: NumberedItem,
    mode: "assign" | "return" | "status",
  ) => void;
  onQuantity: (item: CatalogItem, mode: "return" | "transfer") => void;
  onShare: () => void;
  onSignature: (signature: SignatureSummary) => void;
}) {
  const numbered = numberedItemsForSoldier(
    data.numberedItems,
    soldier.personalNumber,
  );
  const holdings = holdingsForSoldier(data.holdings, soldier.personalNumber);
  const history = [...data.movements]
    .reverse()
    .filter(
      (entry) =>
        entry.previousSoldier === soldier.personalNumber ||
        entry.newSoldier === soldier.personalNumber,
    );
  const signatures = [...data.signatures]
    .reverse()
    .filter(
      (signature) => signature.personalNumber === soldier.personalNumber,
    );
  return (
    <Modal title={soldier.name} onClose={onClose}>
      <p>
        מספר אישי <bdi>{soldier.personalNumber}</bdi> · מחלקה {soldier.platoon}
        {soldier.phone && (
          <>
            {" "}
            · טלפון <bdi>{soldier.phone}</bdi>
          </>
        )}
      </p>
      <button
        className="icon-button share-button"
        type="button"
        title="שיתוף תנועות ב-WhatsApp"
        aria-label={`שיתוף התנועות של ${soldier.name} ב-WhatsApp`}
        onClick={onShare}
      >
        <img src={whatsappIconUrl} alt="" />
      </button>
      <h3>ציוד נוכחי</h3>
      <div className="cards-list compact">
        {numbered.map((item) => (
          <article className="list-card" key={`${item.type}-${item.number}`}>
            <div>
              <strong>
                {itemLabel(item.type, item.variant)} · {item.number}
              </strong>
            </div>
            {editable && (
              <div className="card-actions">
                <button
                  className="small-button"
                  onClick={() => onNumbered(item, "return")}
                >
                  החזרה
                </button>
                <button
                  className="small-button"
                  onClick={() => onNumbered(item, "assign")}
                >
                  העברה
                </button>
              </div>
            )}
          </article>
        ))}
        {holdings.map((holding) => {
          const item = data.catalog.find(
            (candidate) =>
              catalogKey(candidate.type, candidate.variant) ===
              catalogKey(holding.type, holding.variant),
          );
          return (
            item && (
              <article
                className="list-card"
                key={catalogKey(holding.type, holding.variant)}
              >
                <div>
                  <strong>
                    {itemLabel(item.type, item.variant, item.variantLabel)}
                  </strong>
                  <p>{holding.quantity} יח׳</p>
                </div>
                {editable && (
                  <div className="card-actions">
                    <button
                      className="small-button"
                      onClick={() => onQuantity(item, "return")}
                    >
                      החזרה
                    </button>
                    <button
                      className="small-button"
                      onClick={() => onQuantity(item, "transfer")}
                    >
                      העברה
                    </button>
                  </div>
                )}
              </article>
            )
          );
        })}
        {!numbered.length && !holdings.length && (
          <EmptyList>אין ציוד מוחזק.</EmptyList>
        )}
      </div>
      <h3>חתימות</h3>
      <div className="history-list signature-summary-list">
        {signatures.map((signature) => (
          <article key={signature.row}>
            <div className="history-card-heading">
              <div>
                <strong>פעולת החתמה</strong>
                <small>
                  {displayDate(signature.timestamp)} · {signature.actor}
                </small>
              </div>
              <button
                type="button"
                className="small-button"
                onClick={() => onSignature(signature)}
              >
                הצגת חתימה
              </button>
            </div>
          </article>
        ))}
        {!signatures.length && <EmptyList>אין חתימות לחייל.</EmptyList>}
      </div>
      <h3>היסטוריה</h3>
      <div className="history-list">
        {history.map((entry) => (
          <article key={entry.row}>
            <strong>{entry.action}</strong>
            <span>
              {itemLabel(entry.type, entry.variant)} {entry.number}
              {entry.quantity > 0 && ` · כמות ${entry.quantity}`}
            </span>
            <small>{displayDate(entry.timestamp)}</small>
          </article>
        ))}
        {!history.length && <EmptyList>אין היסטוריה לחייל.</EmptyList>}
      </div>
    </Modal>
  );
}

function CatalogDetail({
  data,
  stockHoldings,
  item,
  editable,
  canManageStock,
  onClose,
  onAction,
}: {
  data: CompanyData;
  stockHoldings: CompanyData["holdings"];
  item: CatalogItem;
  editable: boolean;
  canManageStock: boolean;
  onClose: () => void;
  onAction: (action: Action) => void;
}) {
  const holdings = data.holdings.filter(
    (holding) =>
      holding.type === item.type &&
      holding.variant === item.variant &&
      holding.quantity > 0,
  );
  const history = [...data.movements]
    .reverse()
    .filter(
      (entry) =>
        catalogKey(entry.type, entry.variant) ===
        catalogKey(item.type, item.variant),
    );
  return (
    <Modal
      title={itemLabel(item.type, item.variant, item.variantLabel)}
      onClose={onClose}
    >
      <div className="inventory-numbers">
        <span>
          מלאי <strong>{item.totalStock}</strong>
        </span>
        <span>
          מוחזק <strong>{issuedQuantity(item, stockHoldings)}</strong>
        </span>
        <span>
          זמין <strong>{availableQuantity(item, stockHoldings)}</strong>
        </span>
      </div>
      {editable && (
        <div className="quick-actions">
          <button
            className="primary-button"
            onClick={() => onAction({ kind: "quantity", item, mode: "issue" })}
          >
            החתמה
          </button>
          {canManageStock && (
            <button
              className="secondary-button"
              onClick={() => onAction({ kind: "stock", item })}
            >
              עדכון מלאי
            </button>
          )}
        </div>
      )}
      <h3>מחזיקים</h3>
      <div className="cards-list compact">
        {holdings.map((holding) => {
          const soldier = data.soldiers.find(
            (candidate) => candidate.personalNumber === holding.personalNumber,
          );
          return (
            <article className="list-card" key={holding.personalNumber}>
              <div>
                <strong>{soldier?.name || holding.personalNumber}</strong>
                <p>
                  {soldier?.platoon && `מחלקה ${soldier.platoon} · `}
                  {holding.quantity} יח׳
                </p>
              </div>
              {editable && soldier && (
                <div className="card-actions">
                  <button
                    className="small-button"
                    onClick={() =>
                      onAction({
                        kind: "quantity",
                        item,
                        mode: "return",
                        soldier,
                      })
                    }
                  >
                    החזרה
                  </button>
                  <button
                    className="small-button"
                    onClick={() =>
                      onAction({
                        kind: "quantity",
                        item,
                        mode: "transfer",
                        soldier,
                      })
                    }
                  >
                    העברה
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!holdings.length && <EmptyList>אין החזקות פעילות.</EmptyList>}
      </div>
      <h3>היסטוריה</h3>
      <div className="history-list">
        {history.map((entry) => (
          <article key={entry.row}>
            <strong>{entry.action}</strong>
            <span>
              {entry.number && `${entry.number} · `}
              {entry.quantity > 0 && `כמות ${entry.quantity}`}
            </span>
            <small>{displayDate(entry.timestamp)}</small>
          </article>
        ))}
        {!history.length && <EmptyList>אין היסטוריה לסוג הציוד.</EmptyList>}
      </div>
    </Modal>
  );
}
