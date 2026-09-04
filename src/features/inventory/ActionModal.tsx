import { useState } from "react";
import type { Action } from "../../app/types";
import type { CompanyData } from "../../domain/types";
import { EQUIPMENT_STATUSES } from "../../domain/types";
import { Field, Modal } from "../../components/ui";

export function ActionModal({
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
