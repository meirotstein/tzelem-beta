import { useState } from "react";
import type { CatalogInput, CatalogItem, CompanyData, ManagementMethod } from "../../domain/types";
import { Field, Modal } from "../../components/ui";

export function CatalogFormModal({
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
    item?.method ||
      (allowedMethods.includes("כמותי") ? "כמותי" : allowedMethods[0]) ||
      "צל״מ",
  );
  const [stock, setStock] = useState(String(item?.totalStock || 0));
  const [location, setLocation] = useState(item?.location || "");
  const [standard, setStandard] = useState(
    item?.standard == null ? "" : String(item.standard),
  );
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
            location: method === "כמותי" ? location : "",
            standard: standard === "" ? null : Number(standard),
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
        {method === "כמותי" && (
          <Field label="מיקום (אופציונלי)">
            <select
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            >
              <option value="">ללא מיקום</option>
              {data.settings.locations.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="תקן (אופציונלי)">
          <input
            type="number"
            min="0"
            step="1"
            value={standard}
            onChange={(event) => setStandard(event.target.value)}
          />
        </Field>
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
