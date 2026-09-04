import type { FormEvent, ReactNode } from "react";
import logoUrl from "../../assets/logo-8208.png";
import { Field } from "../ui";

export function ShellHeader({
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
export function Splash({ text }: { text: string }) {
  return (
    <div className="splash" dir="rtl">
      <img src={logoUrl} alt="" />
      <h1>מת״ש</h1>
      <p className="product-subtitle">ניהול ציוד פלוגתי</p>
      <p>{text}</p>
    </div>
  );
}
export function Welcome({ error, onSignIn }: { error: string; onSignIn: () => void }) {
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
export function SheetPicker({
  name,
  value,
  setValue,
  error,
  onSubmit,
  onSignOut,
}: {
  name: string;
  value: string;
  setValue: (value: string) => void;
  error: string;
  onSubmit: (event: FormEvent) => void;
  onSignOut: () => void;
}) {
  return (
    <ShellHeader name={name} onSignOut={onSignOut}>
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
