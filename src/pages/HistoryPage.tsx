import { useState } from "react";
import { itemLabel } from "../domain/schema";
import type { CompanyData, MovementEntry, SignatureSummary } from "../domain/types";
import { MANAGEMENT_METHODS } from "../domain/types";
import { displayDate, signatureForMovement } from "../app/format";
import { EmptyList, Field } from "../components/ui";

export function HistoryView({
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
