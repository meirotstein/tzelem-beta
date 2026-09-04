import type { Action, AppState, ConfirmationRequest, SignatureViewerState, SigningSeed, View } from "./app/types";
import { ConfirmDialog, ToastMessage } from "./components/ui";
import { SheetPicker, ShellHeader, Splash, Welcome } from "./components/entry/EntryViews";
import { EmptySpreadsheetView, IncompatibleSpreadsheetView, UpgradeableSpreadsheetView } from "./components/entry/SpreadsheetStateViews";
import { AccessBanners, AuthenticatedHeader, BottomNavigation } from "./components/layout/AuthenticatedLayout";
import { Dashboard } from "./pages/DashboardPage";
import { SoldiersView } from "./pages/SoldiersPage";
import { SigningsView } from "./pages/SigningsPage";
import { InventoryView } from "./pages/InventoryPage";
import { HistoryView } from "./pages/HistoryPage";
import { SettingsView } from "./pages/SettingsPage";
import { SoldierFormModal } from "./features/soldiers/SoldierFormModal";
import { SoldierDetail } from "./features/soldiers/SoldierDetail";
import { EquipmentGroupsModal } from "./features/inventory/EquipmentGroupsModal";
import { CatalogFormModal } from "./features/inventory/CatalogFormModal";
import { NumberedFormModal } from "./features/inventory/NumberedFormModal";
import { ActionModal } from "./features/inventory/ActionModal";
import { CatalogDetail } from "./features/inventory/CatalogDetail";
import { MovementShareModal } from "./features/sharing/MovementShareModal";
import { SignatureViewerModal, SigningReceiptModal } from "./features/signatures/SignatureComponents";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  activeCatalogItemsForMethod,
  canRemoveCatalogItem,
  canRemoveNumberedItem,
  canRemoveSoldier,
} from "./domain/rules";
import {
  canAccessMethod,
  hasAllPlatoons,
  resolveUserAccess,
  scopeCompanyData,
} from "./domain/permissions";
import { itemLabel } from "./domain/schema";
import type {
  CatalogItem,
  CompanyData,
  EquipmentStatus,
  LoadResult,
  MovementEntry,
  NumberedItem,
  SignatureRecord,
  SignatureSummary,
  Soldier,
} from "./domain/types";
import { MANAGEMENT_METHODS } from "./domain/types";
import {
  GOOGLE_LOGIN_HINT_STORAGE_KEY,
  GOOGLE_SIGNED_IN_STORAGE_KEY,
  SPREADSHEET_STORAGE_KEY,
} from "./services/config";
import { GoogleAuthService } from "./services/googleAuth";
import { SpreadsheetRepository } from "./services/spreadsheetRepository";

export interface AppServices {
  auth: Pick<
    GoogleAuthService,
    | "init"
    | "isSignedIn"
    | "restoreSession"
    | "signIn"
    | "currentUserName"
    | "signOut"
  >;
  createRepository: (spreadsheetId: string) => SpreadsheetRepository;
}

const productionServices: AppServices = {
  auth: new GoogleAuthService(),
  createRepository: (spreadsheetId) =>
    new SpreadsheetRepository(spreadsheetId),
};
const idFromValue = (value: string) =>
  value.trim().match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ||
  value.trim();
const initialSpreadsheetId = () =>
  idFromValue(
    new URL(window.location.href).searchParams.get("spid") ||
      localStorage.getItem(SPREADSHEET_STORAGE_KEY) ||
      "",
  );
export function App({ services = productionServices }: { services?: AppServices }) {
  const { auth, createRepository } = services;
  const [appState, setAppState] = useState<AppState>("booting");
  const [spreadsheetId, setSpreadsheetId] = useState(initialSpreadsheetId);
  const [sheetInput, setSheetInput] = useState(initialSpreadsheetId);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] =
    useState<ConfirmationRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [signedInName, setSignedInName] = useState("");
  const [soldierForm, setSoldierForm] = useState<Soldier | "new" | null>(null);
  const [catalogForm, setCatalogForm] = useState<CatalogItem | "new" | null>(
    null,
  );
  const [numberedForm, setNumberedForm] = useState<NumberedItem | "new" | null>(
    null,
  );
  const [numberedFormOrigin, setNumberedFormOrigin] = useState<
    "signings" | null
  >(null);
  const [action, setAction] = useState<Action>(null);
  const [signingSeed, setSigningSeed] = useState<SigningSeed | null>(null);
  const [signingSoldier, setSigningSoldier] = useState<Soldier | null>(null);
  const [signingDirty, setSigningDirty] = useState(false);
  const [soldierDetail, setSoldierDetail] = useState<Soldier | null>(null);
  const [catalogDetail, setCatalogDetail] = useState<CatalogItem | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [movementShareSoldier, setMovementShareSoldier] =
    useState<Soldier | null>(null);
  const [signingReceipt, setSigningReceipt] = useState<{
    soldier: Soldier;
    movements: MovementEntry[];
  } | null>(null);
  const [signatureViewer, setSignatureViewer] =
    useState<SignatureViewerState | null>(null);
  const signatureCache = useRef(new Map<string, SignatureRecord>());

  useEffect(() => {
    if (appState !== "result" || (!error && !notice)) return;
    const timeout = window.setTimeout(
      () => {
        setError("");
        setNotice("");
      },
      error ? 10000 : 5000,
    );
    return () => window.clearTimeout(timeout);
  }, [appState, error, notice]);

  const data = result?.kind === "ready" ? result.data : null;
  const access = useMemo(
    () => (data ? resolveUserAccess(data.meta.userEmail, data.permissions) : null),
    [data],
  );
  const visibleData = useMemo(() => {
    if (!data || !access) return null;
    return scopeCompanyData(data, access);
  }, [access, data]);
  const operationData = useMemo<CompanyData | null>(() => {
    if (!data || !visibleData) return null;
    return {
      ...visibleData,
      holdings: data.holdings,
    };
  }, [data, visibleData]);
  useEffect(() => {
    if (view === "settings" && access && !access.admin) setView("dashboard");
  }, [access, view]);
  const repo = useMemo(
    () => (spreadsheetId ? createRepository(spreadsheetId) : null),
    [createRepository, spreadsheetId],
  );

  function openSignings(
    seed: SigningSeed | null = null,
    soldier: Soldier | null = null,
  ) {
    setSigningSeed(seed);
    setSigningSoldier(soldier);
    setView("signings");
  }

  function navigateToView(nextView: View) {
    if (nextView === view) return;
    const navigate = () => {
      setSigningSeed(null);
      setSigningSoldier(null);
      setSigningDirty(false);
      setView(nextView);
    };
    if (view === "signings" && signingDirty) {
      setConfirmation({
        title: "יציאה ללא שמירה",
        message:
          "יש שינויים בהחתמה שעדיין לא נשמרו. מעבר למסך אחר יאבד את השינויים.",
        confirmLabel: "יציאה ללא שמירה",
        danger: true,
        onConfirm: navigate,
      });
      return;
    }
    navigate();
  }

  function handleInventoryAction(nextAction: Exclude<Action, null>) {
    if (
      nextAction.kind === "numbered" &&
      nextAction.mode === "assign" &&
      !nextAction.item.assignedTo
    ) {
      setCatalogDetail(null);
      openSignings({ kind: "numbered", item: nextAction.item });
      return;
    }
    if (
      nextAction.kind === "quantity" &&
      nextAction.mode === "issue" &&
      !nextAction.soldier
    ) {
      setCatalogDetail(null);
      openSignings({ kind: "quantity", item: nextAction.item });
      return;
    }
    setAction(nextAction);
  }

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
      const loaded = await createRepository(id).inspect();
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
      setNotice(repo.takeConcurrencyNotice() || success);
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

  const confirmationDialog = confirmation && (
    <ConfirmDialog
      request={confirmation}
      onClose={() => setConfirmation(null)}
    />
  );
  const toast = (
    <ToastMessage
      error={error}
      notice={notice}
      onClose={() => {
        setError("");
        setNotice("");
      }}
    />
  );

  if (appState === "booting" || appState === "loading")
    return <Splash text="טוען…" />;
  if (appState === "signed-out")
    return <Welcome error={error} onSignIn={() => void signIn()} />;
  if (appState === "select-sheet")
    return (
      <SheetPicker
        name={signedInName}
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
      <>
        <EmptySpreadsheetView
          result={result}
          userName={signedInName}
          saving={saving}
          onSignOut={signOut}
          onInitialize={() =>
            setConfirmation({
              title: "הכנת הגיליון",
              message:
                "להכין את הגיליון הריק למת״ש? הפעולה תיצור את הלשוניות והכותרות הנדרשות.",
              confirmLabel: "הכנת הגיליון",
              onConfirm: () => void initializeSheet(),
            })
          }
          onChooseAnother={() => setAppState("select-sheet")}
        />
        {toast}
        {confirmationDialog}
      </>
    );
  if (result.kind === "upgradeable")
    return (
      <>
        <UpgradeableSpreadsheetView
          result={result}
          userName={signedInName}
          saving={saving}
          onSignOut={signOut}
          onUpgrade={() =>
            setConfirmation({
              title: "השלמת מבנה הגיליון",
              message:
                "להוסיף לגיליון את הלשוניות והעמודות החסרות? נתונים קיימים לא יימחקו או יועברו.",
              confirmLabel: "השלמת המבנה",
              onConfirm: () => void upgradeSheetStructure(),
            })
          }
          onChooseAnother={() => setAppState("select-sheet")}
        />
        {toast}
        {confirmationDialog}
      </>
    );
  if (result.kind === "incompatible")
    return (
      <IncompatibleSpreadsheetView
        result={result}
        userName={signedInName}
        onSignOut={signOut}
        onChooseAnother={() => setAppState("select-sheet")}
      />
    );
  if (!data || !visibleData || !operationData || !access) return null;

  return (
    <div className="app-shell" dir="rtl">
      <AuthenticatedHeader
        sheetTitle={data.meta.title}
        userName={signedInName || data.meta.userName}
        saving={saving}
        onSignOut={signOut}
      />
      <AccessBanners
        editable={data.meta.editable}
        writeMode={data.settings.writeMode}
        writeModeIssue={data.settings.writeModeIssue}
        admin={access.admin}
      />
      {toast}
      <main className="content">
        {view === "dashboard" && (
          <Dashboard
            data={visibleData}
            editable={data.meta.editable}
            access={access}
            onView={setView}
            onAddSoldier={() => setSoldierForm("new")}
            onAddNumbered={() => {
              setNumberedFormOrigin(null);
              setNumberedForm("new");
            }}
            onIssue={() => openSignings()}
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
              setConfirmation({
                title: soldier.active ? "הסרת חייל" : "הפעלת חייל מחדש",
                message: soldier.active
                  ? `להסיר את ${soldier.name}? פרטי החייל וההיסטוריה יישמרו.`
                  : `להפעיל מחדש את ${soldier.name}?`,
                confirmLabel: soldier.active ? "הסרה" : "הפעלה מחדש",
                danger: soldier.active,
                onConfirm: () =>
                  void mutate(
                  (current, repository) =>
                    repository.setSoldierActive(
                      current,
                      soldier,
                      !soldier.active,
                  ),
                  soldier.active ? "החייל הוסר" : "החייל הופעל",
                  ),
              });
            }}
          />
        )}
        {view === "signings" && (
          <SigningsView
            data={operationData}
            editable={data.meta.editable}
            saving={saving}
            canAddCatalogType={hasAllPlatoons(access)}
            canAddNumberedItem={canAccessMethod(access, "צל״מ")}
            onAddCatalogType={() => setCatalogForm("new")}
            onAddNumberedItem={() => {
              setNumberedFormOrigin("signings");
              setNumberedForm("new");
            }}
            initialSoldier={signingSoldier}
            initialItem={signingSeed}
            onInitialItemApplied={() => setSigningSeed(null)}
            onDirtyChange={setSigningDirty}
            onRequestDiscard={(onConfirm) =>
              setConfirmation({
                title: "יציאה ללא שמירה",
                message:
                  "יש שינויים בהחתמה שעדיין לא נשמרו. המשך הפעולה יאבד את השינויים.",
                confirmLabel: "יציאה ללא שמירה",
                danger: true,
                onConfirm,
              })
            }
            onRequestConfirmation={setConfirmation}
            onError={setError}
            onSave={async (soldier, input) => {
              let movements: MovementEntry[] = [];
              const ok = await mutate(async (current, repository) => {
                movements = await repository.saveSigningSession(
                  current,
                  soldier,
                  input,
                );
              }, "ההחתמה נשמרה");
              if (ok) {
                setSigningDirty(false);
                setSigningReceipt({ soldier, movements });
              }
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
            onManageGroups={() => setGroupsOpen(true)}
            onAddNumbered={() => {
              setNumberedFormOrigin(null);
              setNumberedForm("new");
            }}
            onCatalog={setCatalogDetail}
            onCatalogEdit={setCatalogForm}
            onNumberedEdit={(item) => {
              setNumberedFormOrigin(null);
              setNumberedForm(item);
            }}
            onAction={handleInventoryAction}
            onCatalogToggle={(item) => {
              const issue = item.active
                ? canRemoveCatalogItem(
                    item,
                    data.numberedItems,
                    data.holdings,
                    data.equipmentGroups,
                    data.equipmentGroupItems,
                  )
                : null;
              if (issue) return setError(issue);
              setConfirmation({
                title: item.active
                  ? "הסרת סוג ציוד"
                  : "הפעלת סוג ציוד מחדש",
                message: item.active
                  ? `להסיר את ${itemLabel(item.type, item.variant, item.variantLabel)}? הנתונים וההיסטוריה יישמרו.`
                  : `להפעיל מחדש את ${itemLabel(item.type, item.variant, item.variantLabel)}?`,
                confirmLabel: item.active ? "הסרה" : "הפעלה מחדש",
                danger: item.active,
                onConfirm: () =>
                  void mutate(
                  (current, repository) =>
                    repository.setCatalogActive(current, item, !item.active),
                  item.active ? "סוג הציוד הוסר" : "סוג הציוד הופעל",
                  ),
              });
            }}
            onNumberedToggle={(item) => {
              const issue = item.active ? canRemoveNumberedItem(item) : null;
              if (issue) return setError(issue);
              setConfirmation({
                title: item.active ? "הסרת פריט צל״מ" : "הפעלת פריט מחדש",
                message: item.active
                  ? `להסיר את ${itemLabel(item.type, item.variant)} מספר ${item.number}? הנתונים וההיסטוריה יישמרו.`
                  : `להפעיל מחדש את ${itemLabel(item.type, item.variant)} מספר ${item.number}?`,
                confirmLabel: item.active ? "הסרה" : "הפעלה מחדש",
                danger: item.active,
                onConfirm: () =>
                  void mutate(
                  (current, repository) =>
                    repository.setNumberedItemActive(
                      current,
                      item,
                      !item.active,
                  ),
                  item.active ? "הפריט הוסר" : "הפריט הופעל",
                  ),
              });
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
            onSave={(settings) =>
              void mutate(
                (current, repository) =>
                  repository.saveSettings(current, settings),
                "ההגדרות נשמרו",
              )
            }
            onSavePermissions={(permissions) =>
              void mutate(
                (current, repository) =>
                  repository.savePermissions(current, permissions),
                "ההרשאות נשמרו",
              )
            }
            onWriteModeChange={(mode) =>
              void mutate(
                (current, repository) =>
                  repository.setWriteMode(current, mode),
                mode === "direct"
                  ? "מצב השמירה הישירה הופעל"
                  : "השמירה המוגנת הופעלה",
              )
            }
            onRequestConfirmation={setConfirmation}
          />
        )}
      </main>
      <BottomNavigation
        view={view}
        admin={access.admin}
        onNavigate={navigateToView}
      />

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
      {groupsOpen &&
        hasAllPlatoons(access) &&
        canAccessMethod(access, "כמותי") && (
          <EquipmentGroupsModal
            data={visibleData}
            editable={data.meta.editable}
            saving={saving}
            onClose={() => setGroupsOpen(false)}
            onSave={(group, input) =>
              mutate(
                (current, repository) =>
                  group
                    ? repository.editEquipmentGroup(current, group, input)
                    : repository.addEquipmentGroup(current, input),
                group ? "הערכה נשמרה" : "הערכה נוספה",
              )
            }
            onToggle={(group) =>
              setConfirmation({
                title: group.active ? "הסרת ערכת ציוד" : "הפעלת ערכה מחדש",
                message: group.active
                  ? `להסיר את הערכה ${group.name}? הגדרת הערכה תישמר.`
                  : `להפעיל מחדש את הערכה ${group.name}?`,
                confirmLabel: group.active ? "הסרה" : "הפעלה מחדש",
                danger: group.active,
                onConfirm: () =>
                  void mutate(
                    (current, repository) =>
                      repository.setEquipmentGroupActive(
                        current,
                        group,
                        !group.active,
                      ),
                    group.active ? "הערכה הוסרה" : "הערכה הופעלה",
                  ),
              })
            }
          />
        )}
      {numberedForm &&
        canAccessMethod(access, "צל״מ") &&
        (numberedForm === "new" || hasAllPlatoons(access)) && (
        <NumberedFormModal
          data={{
            ...operationData,
            catalog: activeCatalogItemsForMethod(
              operationData.catalog,
              "צל״מ",
            ),
          }}
          item={numberedForm === "new" ? undefined : numberedForm}
          saving={saving}
          onClose={() => {
            setNumberedForm(null);
            setNumberedFormOrigin(null);
          }}
          onSave={async (type, variant, number, location, note) => {
            const input = {
              type,
              variant,
              number,
              status: "זמין" as const,
              location,
              note,
            };
            const ok = await mutate(
              (current, repository) =>
                numberedForm === "new"
                  ? repository.addNumberedItem(current, input)
                  : repository.editNumberedItem(current, numberedForm, input),
              numberedForm === "new" ? "הפריט נוסף" : "הפריט נשמר",
            );
            if (ok) {
              if (
                numberedForm === "new" &&
                numberedFormOrigin === "signings"
              ) {
                setSigningSeed({
                  kind: "numbered",
                  item: {
                    row: 0,
                    type,
                    variant,
                    number,
                    status: "זמין",
                    assignedTo: "",
                    location,
                    note,
                    active: true,
                  },
                });
              }
              setNumberedForm(null);
              setNumberedFormOrigin(null);
            }
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
          onOpenSigning={() => {
            const selected = soldierDetail;
            setSoldierDetail(null);
            openSignings(null, selected);
          }}
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
      {confirmationDialog}
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
          onAction={handleInventoryAction}
        />
      )}
    </div>
  );
}
