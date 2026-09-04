import type { View } from "../../app/types";
import logoUrl from "../../assets/logo-8208.png";

export function AuthenticatedHeader({
  sheetTitle,
  userName,
  saving,
  onSignOut,
}: {
  sheetTitle: string;
  userName: string;
  saving: boolean;
  onSignOut: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <img src={logoUrl} alt="" />
        <div>
          <strong>מת״ש</strong>
          <small>ניהול ציוד פלוגתי · {sheetTitle}</small>
        </div>
      </div>
      <div className="user-area">
        {saving && (
          <span className="save-indicator" role="status">
            שומר…
          </span>
        )}
        <span>{userName}</span>
        <button className="text-button" onClick={onSignOut}>
          יציאה
        </button>
      </div>
    </header>
  );
}

export function AccessBanners({
  editable,
  writeMode,
  writeModeIssue,
  admin,
}: {
  editable: boolean;
  writeMode: "coordinated" | "direct";
  writeModeIssue: boolean;
  admin: boolean;
}) {
  return (
    <>
      {!editable && (
        <div className="read-only-banner">
          הגיליון פתוח לקריאה בלבד. פעולות עריכה אינן זמינות.
        </div>
      )}
      {writeMode === "direct" && (
        <div className="emergency-write-banner" role="alert">
          מצב חירום פעיל: השמירות מתבצעות ישירות לגיליון ללא הגנה מלאה מפני
          פעולות מקבילות.
        </div>
      )}
      {writeModeIssue && admin && (
        <div className="read-only-banner" role="alert">
          ערך מצב השמירה בגיליון אינו מוכר. המערכת משתמשת בשמירה מוגנת.
        </div>
      )}
    </>
  );
}

const NAVIGATION_ITEMS: Array<[View, string]> = [
  ["dashboard", "בית"],
  ["signings", "החתמות"],
  ["soldiers", "חיילים"],
  ["inventory", "מלאי"],
  ["history", "תנועות"],
  ["settings", "הגדרות"],
];

export function BottomNavigation({
  view,
  admin,
  onNavigate,
}: {
  view: View;
  admin: boolean;
  onNavigate: (view: View) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="ניווט ראשי">
      {NAVIGATION_ITEMS.filter(
        ([id]) => id !== "settings" || admin,
      ).map(([id, label]) => (
        <button
          key={id}
          className={view === id ? "active" : ""}
          onClick={() => onNavigate(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
