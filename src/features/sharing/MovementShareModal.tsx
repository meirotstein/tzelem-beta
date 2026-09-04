import { useMemo, useState } from "react";
import { buildSoldierMovementsWhatsAppMessage, shareOnWhatsApp } from "../../domain/sharing";
import { itemLabel } from "../../domain/schema";
import type { CompanyData, Soldier } from "../../domain/types";
import whatsappIconUrl from "../../assets/whatsapp.svg";
import { displayDate } from "../../app/format";
import { Field, Modal } from "../../components/ui";

export function MovementShareModal({
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
