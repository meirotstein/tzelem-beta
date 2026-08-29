import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { canArchiveEquipment, canArchiveSoldier, equipmentForSoldier, soldiersWithoutEquipment } from './domain/rules';
import { equipmentKey } from './domain/schema';
import {
  CompanyData,
  EQUIPMENT_STATUSES,
  Equipment,
  EquipmentInput,
  EquipmentStatus,
  HistoryEntry,
  LoadResult,
  Soldier,
  SoldierInput,
} from './domain/types';
import {
  GOOGLE_LOGIN_HINT_STORAGE_KEY,
  GOOGLE_SIGNED_IN_STORAGE_KEY,
  SPREADSHEET_STORAGE_KEY,
} from './services/config';
import { GoogleAuthService } from './services/googleAuth';
import { SpreadsheetRepository } from './services/spreadsheetRepository';
import logoUrl from './assets/logo-8208.png';

type View = 'dashboard' | 'soldiers' | 'equipment' | 'history' | 'settings';
type AppState = 'booting' | 'signed-out' | 'select-sheet' | 'loading' | 'result' | 'error';

const auth = new GoogleAuthService();

function idFromValue(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || trimmed;
}

function initialSpreadsheetId(): string {
  const url = new URL(window.location.href);
  return idFromValue(url.searchParams.get('spid') || localStorage.getItem(SPREADSHEET_STORAGE_KEY) || '');
}

function displayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function soldierName(data: CompanyData, personalNumber: string): string {
  return data.soldiers.find((soldier) => soldier.personalNumber === personalNumber)?.name || personalNumber || '—';
}

function statusClass(status: EquipmentStatus): string {
  if (status === 'זמין') return 'success';
  if (status === 'משויך') return 'info';
  if (status === 'אבוד' || status === 'מושבת') return 'danger';
  return 'warning';
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="סגירה">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function EmptyList({ children }: { children: ReactNode }) {
  return <div className="empty-list">{children}</div>;
}

export function App() {
  const [appState, setAppState] = useState<AppState>('booting');
  const [spreadsheetId, setSpreadsheetId] = useState(initialSpreadsheetId);
  const [sheetInput, setSheetInput] = useState(initialSpreadsheetId);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [signedInName, setSignedInName] = useState('');
  const [soldierForm, setSoldierForm] = useState<Soldier | 'new' | null>(null);
  const [equipmentForm, setEquipmentForm] = useState<Equipment | 'new' | null>(null);
  const [assignItem, setAssignItem] = useState<Equipment | 'choose' | null>(null);
  const [returnItem, setReturnItem] = useState<Equipment | null>(null);
  const [statusItem, setStatusItem] = useState<Equipment | null>(null);
  const [soldierDetail, setSoldierDetail] = useState<Soldier | null>(null);
  const [equipmentDetail, setEquipmentDetail] = useState<Equipment | null>(null);

  const data = result?.kind === 'ready' ? result.data : null;
  const repo = useMemo(() => (spreadsheetId ? new SpreadsheetRepository(spreadsheetId) : null), [spreadsheetId]);

  useEffect(() => {
    let cancelled = false;
    auth.init().then(async () => {
      if (cancelled) return;
      if (auth.isSignedIn() || localStorage.getItem(GOOGLE_SIGNED_IN_STORAGE_KEY) === 'true') {
        try {
          await auth.restoreSession();
          if (cancelled) return;
          setSignedInName(auth.currentUserName());
          localStorage.setItem(GOOGLE_SIGNED_IN_STORAGE_KEY, 'true');
          if (spreadsheetId) await loadSpreadsheet(spreadsheetId, cancelled);
          else setAppState('select-sheet');
          return;
        } catch {
          localStorage.removeItem(GOOGLE_SIGNED_IN_STORAGE_KEY);
        }
      }
      if (!cancelled) setAppState('signed-out');
    }).catch(() => {
      if (!cancelled) {
        setError('לא ניתן לטעון את שירות ההתחברות של Google');
        setAppState('error');
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function signIn() {
    try {
      setAppState('loading');
      await auth.signIn(localStorage.getItem(GOOGLE_LOGIN_HINT_STORAGE_KEY) || '');
      setSignedInName(auth.currentUserName());
      localStorage.setItem(GOOGLE_SIGNED_IN_STORAGE_KEY, 'true');
      if (spreadsheetId) await loadSpreadsheet(spreadsheetId);
      else setAppState('select-sheet');
    } catch {
      setError('ההתחברות ל-Google נכשלה');
      setAppState('signed-out');
    }
  }

  function signOut() {
    auth.signOut();
    localStorage.removeItem(GOOGLE_SIGNED_IN_STORAGE_KEY);
    localStorage.removeItem(GOOGLE_LOGIN_HINT_STORAGE_KEY);
    setSignedInName('');
    setResult(null);
    setAppState('signed-out');
  }

  async function loadSpreadsheet(idValue: string, cancelled = false) {
    const id = idFromValue(idValue);
    if (!id) {
      setError('יש להזין מזהה או קישור לגיליון');
      setAppState('select-sheet');
      return;
    }
    try {
      setAppState('loading');
      setError('');
      const loaded = await new SpreadsheetRepository(id).inspect();
      if (cancelled) return;
      setSpreadsheetId(id);
      setSheetInput(id);
      localStorage.setItem(SPREADSHEET_STORAGE_KEY, id);
      if (loaded.kind === 'ready' && loaded.data.meta.userEmail) {
        localStorage.setItem(GOOGLE_LOGIN_HINT_STORAGE_KEY, loaded.data.meta.userEmail);
      }
      setResult(loaded);
      setSignedInName(loaded.kind === 'ready' ? loaded.data.meta.userName || auth.currentUserName() : loaded.meta.userName || auth.currentUserName());
      setView('dashboard');
      setAppState('result');
    } catch (loadError) {
      if (cancelled) return;
      setError(loadError instanceof Error && loadError.message.startsWith('סטטוס') || loadError instanceof Error && loadError.message.includes('שורה') || loadError instanceof Error && loadError.message.includes('כפול')
        ? loadError.message
        : 'אין גישה לגיליון או שלא ניתן לקרוא אותו');
      setAppState('error');
    }
  }

  async function initializeSheet() {
    if (!repo || result?.kind !== 'empty') return;
    if (!window.confirm('להכין את הגיליון הריק לצל״ם פלוגתי? הפעולה תיצור את הלשוניות והכותרות הנדרשות.')) return;
    try {
      setSaving(true);
      await repo.initializeEmptyWorkbook(result.meta);
      await loadSpreadsheet(spreadsheetId);
      setNotice('הגיליון הוכן בהצלחה');
    } catch {
      setError('הכנת הגיליון נכשלה. לא כל השינויים נשמרו.');
    } finally {
      setSaving(false);
    }
  }

  async function mutate(operation: (current: CompanyData, repository: SpreadsheetRepository) => Promise<void>, success: string): Promise<boolean> {
    if (!data || !repo || data.meta.isReadOnly || saving) return false;
    try {
      setSaving(true);
      setError('');
      setNotice('');
      await operation(data, repo);
      await loadSpreadsheet(spreadsheetId);
      setNotice(success);
      return true;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'השמירה נכשלה');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function switchSheet(event: FormEvent) {
    event.preventDefault();
    void loadSpreadsheet(sheetInput);
  }

  function openSheetPicker() {
    setResult(null);
    setError('');
    setAppState('select-sheet');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={logoUrl} alt="" aria-hidden="true" />
          <div><h1>צל״ם פלוגתי</h1><p>{data?.meta.title || 'ניהול ציוד לחימה'}</p></div>
        </div>
        {appState !== 'booting' && appState !== 'signed-out' && (
          <div className="top-actions">
            {signedInName && <span className="user-name" title="המשתמש המחובר">{signedInName}</span>}
            <button className="ghost-button compact" onClick={signOut}>יציאה</button>
          </div>
        )}
      </header>

      {error && <div className="banner error-banner" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
      {notice && <div className="banner success-banner" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      {appState === 'booting' && <StatePanel title="טוען את צל״ם פלוגתי…" loading />}
      {appState === 'loading' && <StatePanel title="טוען נתונים מ-Google Sheets…" loading />}
      {appState === 'signed-out' && (
        <StatePanel title="חיבור מאובטח ל-Google">
          <p>יש להתחבר עם חשבון בעל גישה לגיליון הפלוגתי.</p>
          <button className="primary-button" onClick={signIn}>התחברות באמצעות Google</button>
        </StatePanel>
      )}
      {appState === 'select-sheet' && (
        <StatePanel title="בחירת גיליון">
          <form className="stack-form" onSubmit={switchSheet}>
            <Field label="מזהה או קישור ל-Google Sheets">
              <input dir="ltr" value={sheetInput} onChange={(event) => setSheetInput(event.target.value)} autoFocus />
            </Field>
            <button className="primary-button" type="submit">פתיחת הגיליון</button>
          </form>
        </StatePanel>
      )}
      {appState === 'error' && (
        <StatePanel title="לא ניתן לפתוח את הגיליון">
          <p>{error || 'אירעה שגיאה לא צפויה'}</p>
          <button className="primary-button" onClick={openSheetPicker}>בחירת גיליון אחר</button>
        </StatePanel>
      )}
      {appState === 'result' && result?.kind === 'empty' && (
        <StatePanel title="הגיליון ריק">
          <p>ניתן להכין אותו לשימוש בצל״ם פלוגתי באמצעות יצירת ארבע הלשוניות הנדרשות.</p>
          {result.meta.isReadOnly ? (
            <p className="read-only-note">נדרשת הרשאת עריכה כדי להכין את הגיליון.</p>
          ) : (
            <button className="primary-button" disabled={saving} onClick={initializeSheet}>הכנת הגיליון לצל״ם פלוגתי</button>
          )}
        </StatePanel>
      )}
      {appState === 'result' && result?.kind === 'incompatible' && (
        <StatePanel title="מבנה הגיליון אינו תואם לצל״ם פלוגתי">
          <p>לא בוצעו שינויים בגיליון.</p>
          <ul className="issues-list">{result.issues.map((issue, index) => <li key={`${issue.tab}-${index}`}>{issue.message}</li>)}</ul>
          <button className="ghost-button" onClick={() => loadSpreadsheet(spreadsheetId)}>בדיקה מחדש</button>
        </StatePanel>
      )}
      {appState === 'result' && data && (
        <>
          {data.meta.isReadOnly && <div className="read-only-banner">מצב צפייה בלבד — לחשבון הנוכחי אין הרשאת עריכה בגיליון.</div>}
          <section className="workspace">
            {view === 'dashboard' && <Dashboard data={data} onAddSoldier={() => setSoldierForm('new')} onAddEquipment={() => setEquipmentForm('new')} onAssign={() => setAssignItem('choose')} readOnly={data.meta.isReadOnly} />}
            {view === 'soldiers' && <SoldiersView data={data} onDetail={setSoldierDetail} onAdd={() => setSoldierForm('new')} readOnly={data.meta.isReadOnly} />}
            {view === 'equipment' && <EquipmentView data={data} onDetail={setEquipmentDetail} onAdd={() => setEquipmentForm('new')} readOnly={data.meta.isReadOnly} />}
            {view === 'history' && <HistoryView data={data} />}
            {view === 'settings' && <SettingsView data={data} saving={saving} onSave={(settings, action, note) => mutate((current, repository) => repository.saveSettings(current, settings, action, note), 'ההגדרות נשמרו')} />}
          </section>
          <nav className="bottom-nav" aria-label="ניווט ראשי">
            {([
              ['dashboard', '⌂', 'ראשי'],
              ['soldiers', '♟', 'חיילים'],
              ['equipment', '▣', 'צל״ם'],
              ['history', '↶', 'היסטוריה'],
              ['settings', '⚙', 'הגדרות'],
            ] as [View, string, string][]).map(([key, icon, label]) => (
              <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}><span>{icon}</span>{label}</button>
            ))}
          </nav>
        </>
      )}

      {data && soldierForm && <SoldierFormModal data={data} soldier={soldierForm === 'new' ? undefined : soldierForm} saving={saving} onClose={() => setSoldierForm(null)} onSave={(input) => mutate((current, repository) => soldierForm === 'new' ? repository.addSoldier(current, input) : repository.editSoldier(current, soldierForm, input), soldierForm === 'new' ? 'החייל נוסף' : 'פרטי החייל עודכנו').then((ok) => { if (ok) setSoldierForm(null); })} />}
      {data && equipmentForm && <EquipmentFormModal data={data} item={equipmentForm === 'new' ? undefined : equipmentForm} saving={saving} onClose={() => setEquipmentForm(null)} onSave={(input) => mutate((current, repository) => equipmentForm === 'new' ? repository.addEquipment(current, input) : repository.editEquipment(current, equipmentForm, input), equipmentForm === 'new' ? 'הצל״ם נוסף' : 'פרטי הצל״ם עודכנו').then((ok) => { if (ok) setEquipmentForm(null); })} />}
      {data && assignItem && <AssignmentModal data={data} initialItem={assignItem === 'choose' ? undefined : assignItem} saving={saving} onClose={() => setAssignItem(null)} onSave={(item, soldier, note) => mutate((current, repository) => repository.assign(current, item, soldier, note), item.assignedTo ? 'הצל״ם הועבר' : 'הצל״ם שויך').then((ok) => { if (ok) setAssignItem(null); })} />}
      {data && returnItem && <NoteModal title={`החזרת ${returnItem.type} ${returnItem.number}`} prompt="הערה (רשות)" confirmLabel="אישור החזרה" saving={saving} onClose={() => setReturnItem(null)} onSave={(note) => mutate((current, repository) => repository.returnEquipment(current, returnItem, note), 'הצל״ם הוחזר').then((ok) => { if (ok) setReturnItem(null); })} />}
      {data && statusItem && <StatusModal item={statusItem} saving={saving} onClose={() => setStatusItem(null)} onSave={(status, note) => mutate((current, repository) => repository.changeEquipmentStatus(current, statusItem, status, note), 'סטטוס הצל״ם עודכן').then((ok) => { if (ok) setStatusItem(null); })} />}
      {data && soldierDetail && <SoldierDetail data={data} soldier={soldierDetail} readOnly={data.meta.isReadOnly} saving={saving} onClose={() => setSoldierDetail(null)} onEdit={() => { setSoldierDetail(null); setSoldierForm(soldierDetail); }} onArchive={() => {
        if (!canArchiveSoldier(soldierDetail.personalNumber, data)) { setError('יש להחזיר או להעביר את כל הציוד לפני ארכוב החייל'); return; }
        if (!window.confirm(soldierDetail.active ? 'לארכב את החייל?' : 'להפעיל מחדש את החייל?')) return;
        void mutate((current, repository) => repository.setSoldierActive(current, soldierDetail, !soldierDetail.active), soldierDetail.active ? 'החייל הועבר לארכיון' : 'החייל הופעל מחדש').then(() => setSoldierDetail(null));
      }} />}
      {data && equipmentDetail && <EquipmentDetail data={data} item={equipmentDetail} readOnly={data.meta.isReadOnly} saving={saving} onClose={() => setEquipmentDetail(null)} onEdit={() => { setEquipmentDetail(null); setEquipmentForm(equipmentDetail); }} onAssign={() => { setEquipmentDetail(null); setAssignItem(equipmentDetail); }} onReturn={() => { setEquipmentDetail(null); setReturnItem(equipmentDetail); }} onStatus={() => { setEquipmentDetail(null); setStatusItem(equipmentDetail); }} onArchive={() => {
        if (!canArchiveEquipment(equipmentDetail)) { setError('יש להחזיר את הציוד לפני ארכובו'); return; }
        if (!window.confirm(equipmentDetail.active ? 'לארכב את הצל״ם?' : 'להפעיל מחדש את הצל״ם?')) return;
        void mutate((current, repository) => repository.setEquipmentActive(current, equipmentDetail, !equipmentDetail.active), equipmentDetail.active ? 'הצל״ם הועבר לארכיון' : 'הצל״ם הופעל מחדש').then(() => setEquipmentDetail(null));
      }} />}
    </main>
  );
}

function StatePanel({ title, children, loading }: { title: string; children?: ReactNode; loading?: boolean }) {
  return <section className="state-panel"><div>{loading && <div className="spinner" />}<h2>{title}</h2>{children}</div></section>;
}

function Dashboard({ data, onAddSoldier, onAddEquipment, onAssign, readOnly }: { data: CompanyData; onAddSoldier: () => void; onAddEquipment: () => void; onAssign: () => void; readOnly: boolean }) {
  const active = data.equipment.filter((item) => item.active);
  const stats = [
    ['סה״כ צל״ם', active.length, 'neutral'],
    ['משויך', active.filter((item) => item.status === 'משויך').length, 'info'],
    ['זמין', active.filter((item) => item.status === 'זמין').length, 'success'],
    ['תקול / בתיקון', active.filter((item) => item.status === 'תקול' || item.status === 'בתיקון').length, 'warning'],
    ['אבוד', active.filter((item) => item.status === 'אבוד').length, 'danger'],
    ['חיילים ללא צל״ם', soldiersWithoutEquipment(data), 'neutral'],
  ];
  return <div className="page"><div className="page-heading"><div><h2>תמונת מצב</h2><p>נתונים עדכניים מהגיליון הפלוגתי</p></div></div>
    <div className="stats-grid">{stats.map(([label, value, tone]) => <article className={`stat-card ${tone}`} key={String(label)}><strong>{value}</strong><span>{label}</span></article>)}</div>
    <div className="quick-actions"><button className="primary-button" disabled={readOnly} onClick={onAssign}>שיוך ציוד</button><button className="secondary-button" disabled={readOnly} onClick={onAddSoldier}>הוספת חייל</button><button className="secondary-button" disabled={readOnly} onClick={onAddEquipment}>הוספת צל״ם</button></div>
    <section className="panel"><div className="section-heading"><h3>פעילות אחרונה</h3></div>{data.history.length ? <HistoryList data={data} entries={[...data.history].reverse().slice(0, 8)} /> : <EmptyList>עדיין אין פעילות מתועדת.</EmptyList>}</section>
  </div>;
}

function SoldiersView({ data, onDetail, onAdd, readOnly }: { data: CompanyData; onDetail: (soldier: Soldier) => void; onAdd: () => void; readOnly: boolean }) {
  const [query, setQuery] = useState('');
  const [platoon, setPlatoon] = useState('');
  const [equipmentState, setEquipmentState] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const filtered = data.soldiers.filter((soldier) => {
    const itemCount = equipmentForSoldier(data, soldier.personalNumber).length;
    return (showArchived || soldier.active)
      && (!platoon || soldier.platoon === platoon)
      && (!equipmentState || (equipmentState === 'assigned' ? itemCount > 0 : itemCount === 0))
      && `${soldier.name} ${soldier.personalNumber} ${soldier.platoon}`.includes(query.trim());
  });
  return <div className="page"><div className="page-heading"><div><h2>חיילים</h2><p>{filtered.length} רשומות</p></div><button className="primary-button compact" disabled={readOnly} onClick={onAdd}>הוספת חייל</button></div>
    <div className="filters"><input placeholder="חיפוש לפי שם או מספר אישי" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={platoon} onChange={(e) => setPlatoon(e.target.value)}><option value="">כל המחלקות</option>{data.settings.platoons.map((value) => <option key={value}>{value}</option>)}</select><select value={equipmentState} onChange={(e) => setEquipmentState(e.target.value)}><option value="">כל מצבי השיוך</option><option value="assigned">עם צל״ם</option><option value="none">ללא צל״ם</option></select><label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> כולל ארכיון</label></div>
    <div className="record-list">{filtered.map((soldier) => <button className={`record-card ${soldier.active ? '' : 'archived'}`} key={`${soldier.row}-${soldier.personalNumber}`} onClick={() => onDetail(soldier)}><div><strong>{soldier.name}</strong><span><bdi>{soldier.personalNumber}</bdi> · מחלקה {soldier.platoon}</span></div><div className="record-side"><span className="count-pill">{equipmentForSoldier(data, soldier.personalNumber).length} פריטים</span><span aria-hidden="true">‹</span></div></button>)}</div>{!filtered.length && <EmptyList>לא נמצאו חיילים התואמים לסינון.</EmptyList>}
  </div>;
}

function EquipmentView({ data, onDetail, onAdd, readOnly }: { data: CompanyData; onDetail: (item: Equipment) => void; onAdd: () => void; readOnly: boolean }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const filtered = data.equipment.filter((item) => (showArchived || item.active) && (!type || item.type === type) && (!status || item.status === status) && `${item.type} ${item.number} ${item.assignedTo} ${soldierName(data, item.assignedTo)}`.includes(query.trim()));
  return <div className="page"><div className="page-heading"><div><h2>מלאי צל״ם</h2><p>{filtered.length} פריטים</p></div><button className="primary-button compact" disabled={readOnly} onClick={onAdd}>הוספת צל״ם</button></div>
    <div className="filters"><input placeholder="חיפוש לפי סוג, מספר צ או חייל" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={type} onChange={(e) => setType(e.target.value)}><option value="">כל הסוגים</option>{data.settings.equipmentTypes.map((value) => <option key={value}>{value}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">כל הסטטוסים</option>{EQUIPMENT_STATUSES.map((value) => <option key={value}>{value}</option>)}</select><label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> כולל ארכיון</label></div>
    <div className="record-list">{filtered.map((item) => <button className={`record-card ${item.active ? '' : 'archived'}`} key={`${item.row}-${equipmentKey(item.type, item.number)}`} onClick={() => onDetail(item)}><div><strong>{item.type} <bdi>{item.number}</bdi></strong><span>{item.assignedTo ? `אצל ${soldierName(data, item.assignedTo)}` : 'ללא חייל משויך'}</span></div><div className="record-side"><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span><span aria-hidden="true">‹</span></div></button>)}</div>{!filtered.length && <EmptyList>לא נמצאו פריטי צל״ם התואמים לסינון.</EmptyList>}
  </div>;
}

function HistoryView({ data }: { data: CompanyData }) {
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('');
  const [type, setType] = useState('');
  const [platoon, setPlatoon] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const actions = [...new Set(data.history.map((entry) => entry.action).filter(Boolean))];
  const filtered = [...data.history].reverse().filter((entry) => {
    const relatedSoldiers = data.soldiers.filter((soldier) => soldier.personalNumber === entry.previousSoldier || soldier.personalNumber === entry.newSoldier);
    const timestamp = new Date(entry.timestamp).getTime();
    const afterStart = !fromDate || (!Number.isNaN(timestamp) && timestamp >= new Date(`${fromDate}T00:00:00`).getTime());
    const beforeEnd = !toDate || (!Number.isNaN(timestamp) && timestamp <= new Date(`${toDate}T23:59:59`).getTime());
    return (!action || entry.action === action)
      && (!type || entry.type === type)
      && (!platoon || relatedSoldiers.some((soldier) => soldier.platoon === platoon))
      && (!status || entry.note.includes(status) || (status === 'משויך' && ['שיוך', 'העברה'].includes(entry.action)) || (status === 'זמין' && entry.action === 'החזרה'))
      && afterStart
      && beforeEnd
      && historySearchText(data, entry).includes(query.trim());
  });
  return <div className="page"><div className="page-heading"><div><h2>היסטוריה</h2><p>{filtered.length} פעולות</p></div></div><div className="filters history-filters"><input placeholder="חיפוש חייל, צל״ם, משתמש או הערה" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={action} onChange={(e) => setAction(e.target.value)}><option value="">כל הפעולות</option>{actions.map((value) => <option key={value}>{value}</option>)}</select><select value={type} onChange={(e) => setType(e.target.value)}><option value="">כל הסוגים</option>{data.settings.equipmentTypes.map((value) => <option key={value}>{value}</option>)}</select><select value={platoon} onChange={(e) => setPlatoon(e.target.value)}><option value="">כל המחלקות</option>{data.settings.platoons.map((value) => <option key={value}>{value}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">כל הסטטוסים</option>{EQUIPMENT_STATUSES.map((value) => <option key={value}>{value}</option>)}</select><Field label="מתאריך"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field><Field label="עד תאריך"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field></div>{filtered.length ? <HistoryList data={data} entries={filtered} /> : <EmptyList>לא נמצאה פעילות התואמת לסינון.</EmptyList>}</div>;
}

function historySearchText(data: CompanyData, entry: HistoryEntry): string {
  return `${entry.action} ${entry.type} ${entry.number} ${entry.previousSoldier} ${entry.newSoldier} ${soldierName(data, entry.previousSoldier)} ${soldierName(data, entry.newSoldier)} ${entry.actor} ${entry.note}`;
}

function HistoryList({ data, entries }: { data: CompanyData; entries: HistoryEntry[] }) {
  return <div className="timeline">{entries.map((entry) => <article key={`${entry.row}-${entry.timestamp}`}><div className="timeline-dot" /><div><div className="timeline-top"><strong>{entry.action}</strong><time>{displayDate(entry.timestamp)}</time></div>{entry.type && <p>{entry.type} <bdi>{entry.number}</bdi></p>}{(entry.previousSoldier || entry.newSoldier) && <p>{entry.previousSoldier ? soldierName(data, entry.previousSoldier) : 'ללא שיוך'} {entry.newSoldier && <>← {soldierName(data, entry.newSoldier)}</>}</p>}{entry.note && <p className="muted">{entry.note}</p>}<small>{entry.actor || 'משתמש לא ידוע'}</small></div></article>)}</div>;
}

function SettingsView({ data, saving, onSave }: { data: CompanyData; saving: boolean; onSave: (settings: CompanyData['settings'], action: string, note: string) => Promise<unknown> }) {
  const [newType, setNewType] = useState('');
  const [newPlatoon, setNewPlatoon] = useState('');
  const readOnly = data.meta.isReadOnly;
  async function add(kind: 'type' | 'platoon') {
    const value = (kind === 'type' ? newType : newPlatoon).trim();
    if (!value) return;
    const list = kind === 'type' ? data.settings.equipmentTypes : data.settings.platoons;
    if (list.includes(value)) return;
    await onSave({ equipmentTypes: kind === 'type' ? [...list, value] : data.settings.equipmentTypes, platoons: kind === 'platoon' ? [...list, value] : data.settings.platoons }, kind === 'type' ? 'הוספת סוג צל״ם' : 'הוספת מחלקה', value);
    kind === 'type' ? setNewType('') : setNewPlatoon('');
  }
  async function remove(kind: 'type' | 'platoon', value: string) {
    const used = kind === 'type' ? data.equipment.some((item) => item.active && item.type === value) : data.soldiers.some((soldier) => soldier.active && soldier.platoon === value);
    if (used) return;
    if (!window.confirm(`להסיר את „${value}” מרשימת האפשרויות?`)) return;
    await onSave({ equipmentTypes: kind === 'type' ? data.settings.equipmentTypes.filter((item) => item !== value) : data.settings.equipmentTypes, platoons: kind === 'platoon' ? data.settings.platoons.filter((item) => item !== value) : data.settings.platoons }, kind === 'type' ? 'הסרת סוג צל״ם' : 'הסרת מחלקה', value);
  }
  return <div className="page"><div className="page-heading"><div><h2>הגדרות</h2><p>רשימות בחירה מנוהלות</p></div></div><div className="settings-grid"><section className="panel"><h3>סוגי צל״ם</h3><div className="inline-add"><input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="סוג חדש" disabled={readOnly} /><button onClick={() => add('type')} disabled={readOnly || saving}>הוספה</button></div><div className="tag-list">{data.settings.equipmentTypes.map((value) => { const used = data.equipment.some((item) => item.active && item.type === value); return <span key={value}>{value}<button title={used ? 'הסוג נמצא בשימוש' : 'הסרה'} disabled={readOnly || used || saving} onClick={() => remove('type', value)}>×</button></span>; })}</div></section><section className="panel"><h3>מחלקות</h3><div className="inline-add"><input value={newPlatoon} onChange={(e) => setNewPlatoon(e.target.value)} placeholder="מחלקה חדשה" disabled={readOnly} /><button onClick={() => add('platoon')} disabled={readOnly || saving}>הוספה</button></div><div className="tag-list">{data.settings.platoons.map((value) => { const used = data.soldiers.some((soldier) => soldier.active && soldier.platoon === value); return <span key={value}>{value}<button title={used ? 'המחלקה נמצאת בשימוש' : 'הסרה'} disabled={readOnly || used || saving} onClick={() => remove('platoon', value)}>×</button></span>; })}</div></section></div></div>;
}

function SoldierFormModal({ data, soldier, saving, onClose, onSave }: { data: CompanyData; soldier?: Soldier; saving: boolean; onClose: () => void; onSave: (input: SoldierInput) => Promise<unknown> }) {
  const [name, setName] = useState(soldier?.name || '');
  const [personalNumber, setPersonalNumber] = useState(soldier?.personalNumber || '');
  const [platoon, setPlatoon] = useState(soldier?.platoon || data.settings.platoons[0] || '');
  const submit = (event: FormEvent) => { event.preventDefault(); void onSave({ name, personalNumber, platoon }); };
  return <Modal title={soldier ? 'עריכת חייל' : 'הוספת חייל'} onClose={onClose}><form className="stack-form" onSubmit={submit}><Field label="שם מלא"><input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field><Field label="מספר אישי"><input dir="ltr" inputMode="numeric" value={personalNumber} onChange={(e) => setPersonalNumber(e.target.value)} required disabled={Boolean(soldier)} /></Field>{soldier && <p className="form-hint">המספר האישי משמש כמזהה קבוע ואינו ניתן לשינוי.</p>}<Field label="מחלקה"><select value={platoon} onChange={(e) => setPlatoon(e.target.value)} required><option value="" disabled>בחירת מחלקה</option>{data.settings.platoons.map((value) => <option key={value}>{value}</option>)}</select></Field>{!data.settings.platoons.length && <p className="form-hint warning-text">יש להוסיף מחלקה במסך ההגדרות תחילה.</p>}<div className="form-actions"><button className="ghost-button" type="button" onClick={onClose}>ביטול</button><button className="primary-button" disabled={saving || !data.settings.platoons.length}>שמירה</button></div></form></Modal>;
}

function EquipmentFormModal({ data, item, saving, onClose, onSave }: { data: CompanyData; item?: Equipment; saving: boolean; onClose: () => void; onSave: (input: EquipmentInput) => Promise<unknown> }) {
  const [type, setType] = useState(item?.type || data.settings.equipmentTypes[0] || '');
  const [number, setNumber] = useState(item?.number || '');
  const [note, setNote] = useState(item?.note || '');
  const submit = (event: FormEvent) => { event.preventDefault(); void onSave({ type, number, note }); };
  return <Modal title={item ? 'עריכת צל״ם' : 'הוספת צל״ם'} onClose={onClose}><form className="stack-form" onSubmit={submit}><Field label="סוג"><select value={type} onChange={(e) => setType(e.target.value)} required disabled={Boolean(item)}><option value="" disabled>בחירת סוג</option>{data.settings.equipmentTypes.map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="מספר צ"><input dir="ltr" value={number} onChange={(e) => setNumber(e.target.value)} required autoFocus disabled={Boolean(item)} /></Field>{item && <p className="form-hint">סוג ומספר צ משמשים כמזהה קבוע ואינם ניתנים לשינוי.</p>}<Field label="הערה"><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>{!data.settings.equipmentTypes.length && <p className="form-hint warning-text">יש להוסיף סוג צל״ם במסך ההגדרות תחילה.</p>}<div className="form-actions"><button className="ghost-button" type="button" onClick={onClose}>ביטול</button><button className="primary-button" disabled={saving || !data.settings.equipmentTypes.length}>שמירה</button></div></form></Modal>;
}

function AssignmentModal({ data, initialItem, saving, onClose, onSave }: { data: CompanyData; initialItem?: Equipment; saving: boolean; onClose: () => void; onSave: (item: Equipment, soldier: Soldier, note: string) => Promise<unknown> }) {
  const candidates = data.equipment.filter((item) => item.active && (item.status === 'זמין' || item.status === 'משויך'));
  const soldiers = data.soldiers.filter((soldier) => soldier.active);
  const [itemRow, setItemRow] = useState(String(initialItem?.row || candidates[0]?.row || ''));
  const [soldierRow, setSoldierRow] = useState(String(soldiers[0]?.row || ''));
  const [note, setNote] = useState('');
  const item = data.equipment.find((candidate) => candidate.row === Number(itemRow));
  const soldier = data.soldiers.find((candidate) => candidate.row === Number(soldierRow));
  const submit = (event: FormEvent) => { event.preventDefault(); if (!item || !soldier) return; if (item.assignedTo && !window.confirm(`הצל״ם משויך כעת ל${soldierName(data, item.assignedTo)}. להעביר אותו?`)) return; void onSave(item, soldier, note); };
  return <Modal title={item?.assignedTo ? 'העברת צל״ם' : 'שיוך צל״ם'} onClose={onClose}><form className="stack-form" onSubmit={submit}><Field label="צל״ם"><select value={itemRow} onChange={(e) => setItemRow(e.target.value)} disabled={Boolean(initialItem)}>{candidates.map((candidate) => <option value={candidate.row} key={candidate.row}>{candidate.type} · {candidate.number}{candidate.assignedTo ? ` · אצל ${soldierName(data, candidate.assignedTo)}` : ''}</option>)}</select></Field><Field label="חייל"><select value={soldierRow} onChange={(e) => setSoldierRow(e.target.value)}>{soldiers.map((candidate) => <option value={candidate.row} key={candidate.row}>{candidate.name} · {candidate.personalNumber} · {candidate.platoon}</option>)}</select></Field><Field label="הערה (רשות)"><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field><div className="form-actions"><button className="ghost-button" type="button" onClick={onClose}>ביטול</button><button className="primary-button" disabled={saving || !item || !soldier}>אישור {item?.assignedTo ? 'העברה' : 'שיוך'}</button></div></form></Modal>;
}

function NoteModal({ title, prompt, confirmLabel, saving, onClose, onSave }: { title: string; prompt: string; confirmLabel: string; saving: boolean; onClose: () => void; onSave: (note: string) => Promise<unknown> }) {
  const [note, setNote] = useState('');
  return <Modal title={title} onClose={onClose}><form className="stack-form" onSubmit={(event) => { event.preventDefault(); if (window.confirm('לאשר את הפעולה?')) void onSave(note); }}><Field label={prompt}><textarea value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></Field><div className="form-actions"><button className="ghost-button" type="button" onClick={onClose}>ביטול</button><button className="danger-button" disabled={saving}>{confirmLabel}</button></div></form></Modal>;
}

function StatusModal({ item, saving, onClose, onSave }: { item: Equipment; saving: boolean; onClose: () => void; onSave: (status: EquipmentStatus, note: string) => Promise<unknown> }) {
  const statuses = EQUIPMENT_STATUSES.filter((status) => status !== 'משויך');
  const [status, setStatus] = useState<EquipmentStatus>(item.assignedTo ? 'משויך' : item.status);
  const [note, setNote] = useState('');
  const required = ['אבוד', 'תקול', 'מושבת'].includes(status);
  return <Modal title={`שינוי סטטוס · ${item.type} ${item.number}`} onClose={onClose}><form className="stack-form" onSubmit={(event) => { event.preventDefault(); if (window.confirm(`לשנות סטטוס ל„${status}”?`)) void onSave(status, note); }}><Field label="סטטוס"><select value={status} onChange={(e) => setStatus(e.target.value as EquipmentStatus)} disabled={Boolean(item.assignedTo)}>{item.assignedTo ? <option value="משויך">משויך</option> : statuses.map((value) => <option key={value}>{value}</option>)}</select></Field>{item.assignedTo && <p className="warning-text">יש להחזיר את הציוד לפני שינוי הסטטוס.</p>}<Field label={required ? 'הערה (חובה)' : 'הערה (רשות)'}><textarea value={note} onChange={(e) => setNote(e.target.value)} required={required} /></Field><div className="form-actions"><button className="ghost-button" type="button" onClick={onClose}>ביטול</button><button className="primary-button" disabled={saving || Boolean(item.assignedTo)}>שמירת סטטוס</button></div></form></Modal>;
}

function SoldierDetail({ data, soldier, readOnly, saving, onClose, onEdit, onArchive }: { data: CompanyData; soldier: Soldier; readOnly: boolean; saving: boolean; onClose: () => void; onEdit: () => void; onArchive: () => void }) {
  const items = equipmentForSoldier(data, soldier.personalNumber);
  const history = [...data.history].reverse().filter((entry) => entry.previousSoldier === soldier.personalNumber || entry.newSoldier === soldier.personalNumber);
  return <Modal title={soldier.name} onClose={onClose}><div className="detail-meta"><span>מספר אישי <bdi>{soldier.personalNumber}</bdi></span><span>מחלקה {soldier.platoon}</span>{!soldier.active && <span className="status-pill neutral">בארכיון</span>}</div><section className="detail-section"><h3>צל״ם נוכחי</h3>{items.length ? <div className="mini-list">{items.map((item) => <div key={item.row}><strong>{item.type} <bdi>{item.number}</bdi></strong><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span></div>)}</div> : <EmptyList>אין צל״ם משויך לחייל.</EmptyList>}</section><section className="detail-section"><h3>היסטוריה</h3>{history.length ? <HistoryList data={data} entries={history} /> : <EmptyList>אין פעילות מתועדת.</EmptyList>}</section>{!readOnly && <div className="form-actions sticky-actions"><button className="ghost-button" onClick={onEdit} disabled={saving}>עריכה</button><button className={soldier.active ? 'danger-ghost-button' : 'primary-button'} onClick={onArchive} disabled={saving}>{soldier.active ? 'ארכוב' : 'הפעלה מחדש'}</button></div>}</Modal>;
}

function EquipmentDetail({ data, item, readOnly, saving, onClose, onEdit, onAssign, onReturn, onStatus, onArchive }: { data: CompanyData; item: Equipment; readOnly: boolean; saving: boolean; onClose: () => void; onEdit: () => void; onAssign: () => void; onReturn: () => void; onStatus: () => void; onArchive: () => void }) {
  const history = [...data.history].reverse().filter((entry) => entry.type === item.type && entry.number === item.number);
  return <Modal title={`${item.type} ${item.number}`} onClose={onClose}><div className="detail-meta"><span className={`status-pill ${statusClass(item.status)}`}>{item.status}</span><span>{item.assignedTo ? `אצל ${soldierName(data, item.assignedTo)}` : 'ללא חייל משויך'}</span>{!item.active && <span className="status-pill neutral">בארכיון</span>}</div>{item.note && <p className="note-box">{item.note}</p>}<section className="detail-section"><h3>היסטוריה</h3>{history.length ? <HistoryList data={data} entries={history} /> : <EmptyList>אין פעילות מתועדת.</EmptyList>}</section>{!readOnly && <div className="detail-actions"><button className="ghost-button" onClick={onEdit} disabled={saving}>עריכה</button>{item.active && (item.assignedTo ? <><button className="secondary-button" onClick={onAssign} disabled={saving}>העברה</button><button className="danger-ghost-button" onClick={onReturn} disabled={saving}>החזרה</button></> : <button className="primary-button" onClick={onAssign} disabled={saving || item.status !== 'זמין'}>שיוך</button>)}{item.active && <button className="ghost-button" onClick={onStatus} disabled={saving}>שינוי סטטוס</button>}<button className={item.active ? 'danger-ghost-button' : 'primary-button'} onClick={onArchive} disabled={saving}>{item.active ? 'ארכוב' : 'הפעלה מחדש'}</button></div>}</Modal>;
}
