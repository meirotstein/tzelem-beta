import { useState } from "react";
import { activeCatalogItemsForMethod } from "../../domain/rules";
import { catalogKey, itemLabel } from "../../domain/schema";
import type { CompanyData, NumberedItem } from "../../domain/types";
import { Field, Modal } from "../../components/ui";

export function NumberedFormModal({
  data,
  item,
  saving,
  onClose,
  onSave,
}: {
  data: CompanyData;
  item?: NumberedItem;
  saving: boolean;
  onClose: () => void;
  onSave: (
    type: string,
    variant: string,
    number: string,
    location: string,
    note: string,
  ) => void;
}) {
  const options = activeCatalogItemsForMethod(data.catalog, "צל״מ");
  const [key, setKey] = useState(
    item ? catalogKey(item.type, item.variant) : "",
  );
  const [number, setNumber] = useState(item?.number || "");
  const [location, setLocation] = useState(item?.location || "");
  const [note, setNote] = useState(item?.note || "");
  return (
    <Modal title={item ? "עריכת פריט צל״מ" : "פריט צל״מ חדש"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const selected = options.find(
            (candidate) =>
              catalogKey(candidate.type, candidate.variant) === key,
          );
          if (selected)
            onSave(selected.type, selected.variant, number, location, note);
        }}
      >
        <Field label="סוג צל״מ ופרט נוסף">
          <select
            required
            disabled={Boolean(item)}
            value={key}
            onChange={(event) => setKey(event.target.value)}
          >
            <option value="">בחירה</option>
            {options.map((option) => (
              <option
                key={catalogKey(option.type, option.variant)}
                value={catalogKey(option.type, option.variant)}
              >
                {itemLabel(option.type, option.variant, option.variantLabel)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="מספר מזהה">
          <input
            required
            dir="ltr"
            disabled={Boolean(item)}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
        </Field>
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
        <Field label="הערה">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        {!options.length && (
          <p className="form-error">יש ליצור קודם סוג צל״מ בקטלוג.</p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button
            className="primary-button"
            disabled={saving || !options.length}
          >
            שמירה
          </button>
        </div>
      </form>
    </Modal>
  );
}
