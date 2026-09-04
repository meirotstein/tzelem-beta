import { useState } from "react";
import type { Action } from "../../app/types";
import type { CompanyData } from "../../domain/types";
import { EQUIPMENT_STATUSES } from "../../domain/types";
import { itemLabel } from "../../domain/schema";
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
  const numberedTransfer =
    action.kind === "numbered" &&
    action.mode === "assign" &&
    Boolean(action.item.assignedTo);
  const quantityTransfer =
    action.kind === "quantity" && action.mode === "transfer";
  const transferSource = numberedTransfer
    ? data.soldiers.find(
        (candidate) => candidate.personalNumber === action.item.assignedTo,
      )
    : quantityTransfer
      ? action.soldier
      : undefined;
  const transferItemLabel =
    numberedTransfer || quantityTransfer
      ? itemLabel(
          action.item.type,
          action.item.variant,
          action.kind === "quantity" ? action.item.variantLabel : "",
        )
      : "";
  const sourceQuantity =
    quantityTransfer && transferSource
      ? data.holdings.find(
          (holding) =>
            holding.personalNumber === transferSource.personalNumber &&
            holding.type === action.item.type &&
            holding.variant === action.item.variant,
        )?.quantity || 0
      : 0;
  const title =
    action.kind === "stock"
      ? "עדכון מלאי כולל"
      : numberedTransfer || quantityTransfer
        ? "העברת ציוד"
        : action.mode === "assign" || action.mode === "issue"
          ? "החתמת ציוד"
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
        {(numberedTransfer || quantityTransfer) && transferSource && (
          <div className="action-context">
            <strong>
              {transferItemLabel}
              {numberedTransfer && ` · מספר צ ${action.item.number}`}
            </strong>
            <span>
              העברה מ־{transferSource.name} · מספר אישי{" "}
              <bdi>{transferSource.personalNumber}</bdi>
            </span>
            {quantityTransfer && (
              <small>כמות נוכחית: {sourceQuantity} יח׳</small>
            )}
          </div>
        )}
        {needsSoldier && (
          <Field label={numberedTransfer ? "העברה אל" : "חייל"}>
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
