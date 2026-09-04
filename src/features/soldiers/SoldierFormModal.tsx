import { useState } from "react";
import { validateSoldierInput } from "../../domain/rules";
import type { CompanyData, Soldier, SoldierInput } from "../../domain/types";
import { Field, Modal } from "../../components/ui";

export function SoldierFormModal({
  data,
  soldier,
  saving,
  onClose,
  onSave,
}: {
  data: CompanyData;
  soldier?: Soldier;
  saving: boolean;
  onClose: () => void;
  onSave: (input: SoldierInput) => void;
}) {
  const [name, setName] = useState(soldier?.name || "");
  const [personalNumber, setPersonalNumber] = useState(
    soldier?.personalNumber || "",
  );
  const [platoon, setPlatoon] = useState(soldier?.platoon || "");
  const [phone, setPhone] = useState(soldier?.phone || "");
  const [formError, setFormError] = useState("");
  return (
    <Modal title={soldier ? "עריכת חייל" : "הוספת חייל"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const input = { name, personalNumber, platoon, phone };
          const errors = validateSoldierInput(
            input,
            data.soldiers,
            soldier?.personalNumber,
          );
          if (errors.length) {
            setFormError(errors[0]);
            return;
          }
          setFormError("");
          onSave(input);
        }}
      >
        <Field label="שם מלא">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="מספר אישי">
          <input
            required
            dir="ltr"
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={Boolean(soldier)}
            value={personalNumber}
            onChange={(event) =>
              setPersonalNumber(event.target.value.replace(/\D/g, ""))
            }
          />
        </Field>
        <Field label="מחלקה">
          <select
            required
            value={platoon}
            onChange={(event) => setPlatoon(event.target.value)}
          >
            <option value="">בחירה</option>
            {data.settings.platoons.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label="טלפון (אופציונלי)">
          <input
            type="tel"
            dir="ltr"
            inputMode="tel"
            placeholder="למשל 050-1234567"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
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
