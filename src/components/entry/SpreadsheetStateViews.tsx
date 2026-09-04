import type { LoadResult } from "../../domain/types";
import { ShellHeader } from "./EntryViews";

type EmptyResult = Extract<LoadResult, { kind: "empty" }>;
type UpgradeableResult = Extract<LoadResult, { kind: "upgradeable" }>;
type IncompatibleResult = Extract<LoadResult, { kind: "incompatible" }>;

export function EmptySpreadsheetView({
  result,
  userName,
  saving,
  onSignOut,
  onInitialize,
  onChooseAnother,
}: {
  result: EmptyResult;
  userName: string;
  saving: boolean;
  onSignOut: () => void;
  onInitialize: () => void;
  onChooseAnother: () => void;
}) {
  return (
    <ShellHeader name={userName} onSignOut={onSignOut}>
      <main className="center-card">
        <h2>הגיליון ריק</h2>
        <p>ניתן להכין אותו כמערכת מת״ש חדשה.</p>
        {result.meta.editable ? (
          <button
            className="primary-button"
            disabled={saving}
            onClick={onInitialize}
          >
            הכנת הגיליון למת״ש
          </button>
        ) : (
          <p className="read-only-banner">
            נדרשת הרשאת עריכה כדי להכין את הגיליון.
          </p>
        )}
        <button className="text-button" onClick={onChooseAnother}>
          בחירת גיליון אחר
        </button>
      </main>
    </ShellHeader>
  );
}

export function UpgradeableSpreadsheetView({
  result,
  userName,
  saving,
  onSignOut,
  onUpgrade,
  onChooseAnother,
}: {
  result: UpgradeableResult;
  userName: string;
  saving: boolean;
  onSignOut: () => void;
  onUpgrade: () => void;
  onChooseAnother: () => void;
}) {
  return (
    <ShellHeader name={userName} onSignOut={onSignOut}>
      <main className="center-card">
        <h2>נדרש עדכון קטן במבנה הגיליון</h2>
        <p>
          ניתן להשלים את המבנה על ידי הוספת לשוניות או עמודות בלבד. נתונים
          קיימים לא יימחקו או יועברו.
        </p>
        <ul>
          {result.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        {result.meta.editable ? (
          <button
            className="primary-button"
            disabled={saving}
            onClick={onUpgrade}
          >
            {saving ? "מעדכן…" : "השלמת מבנה הגיליון"}
          </button>
        ) : (
          <p className="read-only-banner">
            נדרשת הרשאת עריכה כדי להשלים את מבנה הגיליון.
          </p>
        )}
        <button className="text-button" onClick={onChooseAnother}>
          בחירת גיליון אחר
        </button>
      </main>
    </ShellHeader>
  );
}

export function IncompatibleSpreadsheetView({
  result,
  userName,
  onSignOut,
  onChooseAnother,
}: {
  result: IncompatibleResult;
  userName: string;
  onSignOut: () => void;
  onChooseAnother: () => void;
}) {
  return (
    <ShellHeader name={userName} onSignOut={onSignOut}>
      <main className="center-card">
        <h2>מבנה הגיליון אינו תואם למת״ש</h2>
        <p>לא בוצעו שינויים.</p>
        <ul>
          {result.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        <button className="text-button" onClick={onChooseAnother}>
          בחירת גיליון אחר
        </button>
      </main>
    </ShellHeader>
  );
}
