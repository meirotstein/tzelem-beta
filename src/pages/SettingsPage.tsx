import { useState } from "react";
import type { CompanyData, PermissionInput, PermissionRecord } from "../domain/types";
import { EQUIPMENT_SCOPES } from "../domain/types";
import type { ConfirmationRequest } from "../app/types";
import { EmptyList, Field, Modal } from "../components/ui";

export function SettingsView({
  data,
  editable,
  onSave,
  onSavePermissions,
  onWriteModeChange,
  onRequestConfirmation,
}: {
  data: CompanyData;
  editable: boolean;
  onSave: (settings: CompanyData["settings"]) => void;
  onSavePermissions: (permissions: PermissionInput[]) => void;
  onWriteModeChange: (mode: "coordinated" | "direct") => void;
  onRequestConfirmation: (request: ConfirmationRequest) => void;
}) {
  const [text, setText] = useState(data.settings.platoons.join("\n"));
  const [locationsText, setLocationsText] = useState(
    data.settings.locations.join("\n"),
  );
  const [permissionForm, setPermissionForm] = useState<
    PermissionRecord | "new" | null
  >(null);
  const permissionInputs = (records: PermissionRecord[]): PermissionInput[] =>
    records.map(({ email, admin, equipmentScope, platoons }) => ({
      email,
      admin,
      equipmentScope,
      platoons,
    }));
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>הגדרות</h1>
          <p>ניהול מחלקות, מיקומים והרשאות</p>
        </div>
      </div>
      <section className="panel write-mode-panel">
        <div>
          <h2>מצב שמירה</h2>
          <p>
            {data.settings.writeMode === "direct"
              ? "שמירה ישירה פעילה ללא הגנה מלאה מפני פעולות מקבילות."
              : "שמירה מוגנת פעילה באמצעות מתאם השמירות."}
          </p>
        </div>
        {editable && (
          <button
            type="button"
            className={
              data.settings.writeMode === "direct"
                ? "primary-button"
                : "small-button danger-text"
            }
            onClick={() => {
              const nextMode =
                data.settings.writeMode === "direct"
                  ? "coordinated"
                  : "direct";
              onRequestConfirmation({
                title:
                  nextMode === "direct"
                    ? "מעבר לשמירה ישירה"
                    : "חזרה לשמירה מוגנת",
                message:
                  nextMode === "direct"
                    ? "שמירה ישירה עוקפת את ההגנה מפני פעולות מקבילות. משתמשים עלולים לדרוס שינויים שנשמרו באותו זמן. יש להשתמש במצב זה רק כאשר שירות השמירה המוגנת אינו זמין."
                    : "להחזיר את המערכת לשמירה מוגנת באמצעות מתאם השמירות?",
                confirmLabel:
                  nextMode === "direct"
                    ? "הפעלת מצב חירום"
                    : "חזרה לשמירה מוגנת",
                danger: nextMode === "direct",
                onConfirm: () => onWriteModeChange(nextMode),
              });
            }}
          >
            {data.settings.writeMode === "direct"
              ? "חזרה לשמירה מוגנת"
              : "מעבר לשמירה ישירה"}
          </button>
        )}
      </section>
      <section className="panel">
        <h2>מחלקות</h2>
        <Field label="מחלקה בכל שורה">
          <textarea
            rows={6}
            value={text}
            disabled={!editable}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        {editable && (
          <button
            className="primary-button"
            onClick={() =>
              onSave({
                ...data.settings,
                platoons: text.split("\n"),
                locations: locationsText.split("\n"),
              })
            }
          >
            שמירת מחלקות
          </button>
        )}
      </section>
      <section className="panel">
        <h2>מיקומי ציוד</h2>
        <Field label="מיקום בכל שורה">
          <textarea
            rows={6}
            value={locationsText}
            disabled={!editable}
            onChange={(event) => setLocationsText(event.target.value)}
          />
        </Field>
        {editable && (
          <button
            className="primary-button"
            onClick={() =>
              onSave({
                ...data.settings,
                platoons: text.split("\n"),
                locations: locationsText.split("\n"),
              })
            }
          >
            שמירת מיקומים
          </button>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>הרשאות משתמשים</h2>
            <p>משתמש ללא הגדרה מקבל גישה לכל המחלקות ולכל סוגי הציוד.</p>
          </div>
          {editable && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setPermissionForm("new")}
            >
              הוספת משתמש
            </button>
          )}
        </div>
        <div className="cards-list compact">
          {data.permissions.map((permission) => (
            <article className="list-card" key={permission.email}>
              <div>
                <strong dir="ltr">{permission.email}</strong>
                <p>
                  {permission.admin
                    ? "מנהל · כל הציוד וכל המחלקות"
                    : `${permission.equipmentScope} · ${
                        permission.platoons.length
                          ? `מחלקות ${permission.platoons.join(", ")}`
                          : "כל המחלקות"
                      }`}
                </p>
              </div>
              {editable && (
                <div className="card-actions">
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => setPermissionForm(permission)}
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    className="small-button danger-text"
                    onClick={() => {
                      onRequestConfirmation({
                        title: "הסרת הרשאת משתמש",
                        message:
                          "להסיר את הגדרת המשתמש? ללא הגדרה תהיה לו גישה תפעולית מלאה כברירת מחדל.",
                        confirmLabel: "הסרת ההרשאה",
                        danger: true,
                        onConfirm: () =>
                          onSavePermissions(
                          permissionInputs(
                            data.permissions.filter(
                              (candidate) =>
                                candidate.email !== permission.email,
                            ),
                          ),
                          ),
                      });
                    }}
                  >
                    הסרה
                  </button>
                </div>
              )}
            </article>
          ))}
          {!data.permissions.length && (
            <EmptyList>
              אין הגדרות הרשאה. יש להוסיף מנהל ראשון ידנית בלשונית הרשאות.
            </EmptyList>
          )}
        </div>
      </section>
      {permissionForm && (
        <PermissionFormModal
          permission={permissionForm === "new" ? undefined : permissionForm}
          platoons={data.settings.platoons}
          onClose={() => setPermissionForm(null)}
          onSave={(input) => {
            const records =
              permissionForm === "new"
                ? [...permissionInputs(data.permissions), input]
                : permissionInputs(data.permissions).map((permission) =>
                    permission.email === permissionForm.email
                      ? input
                      : permission,
                  );
            onSavePermissions(records);
            setPermissionForm(null);
          }}
        />
      )}
    </section>
  );
}

export function PermissionFormModal({
  permission,
  platoons,
  onClose,
  onSave,
}: {
  permission?: PermissionRecord;
  platoons: string[];
  onClose: () => void;
  onSave: (permission: PermissionInput) => void;
}) {
  const [email, setEmail] = useState(permission?.email || "");
  const [admin, setAdmin] = useState(permission?.admin || false);
  const [equipmentScope, setEquipmentScope] = useState<
    PermissionInput["equipmentScope"]
  >(
    permission?.equipmentScope || "הכל",
  );
  const [selectedPlatoons, setSelectedPlatoons] = useState(
    new Set(permission?.platoons || []),
  );
  return (
    <Modal
      title={permission ? "עריכת הרשאה" : "הוספת הרשאה"}
      onClose={onClose}
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            email,
            admin,
            equipmentScope: admin ? "הכל" : equipmentScope,
            platoons: admin ? [] : [...selectedPlatoons],
          });
        }}
      >
        <Field label="אימייל Google">
          <input
            required
            type="email"
            dir="ltr"
            disabled={Boolean(permission)}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="היקף ציוד">
          <select
            disabled={admin}
            value={equipmentScope}
            onChange={(event) =>
              setEquipmentScope(
                event.target.value as PermissionInput["equipmentScope"],
              )
            }
          >
            {EQUIPMENT_SCOPES.map((scope) => (
              <option key={scope}>{scope}</option>
            ))}
          </select>
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={admin}
            onChange={(event) => setAdmin(event.target.checked)}
          />
          מנהל
        </label>
        <fieldset className="permission-platoons" disabled={admin}>
          <legend>מחלקות — ללא בחירה פירושו כל המחלקות</legend>
          {platoons.map((platoon) => (
            <label className="check" key={platoon}>
              <input
                type="checkbox"
                checked={selectedPlatoons.has(platoon)}
                onChange={(event) => {
                  const next = new Set(selectedPlatoons);
                  if (event.target.checked) next.add(platoon);
                  else next.delete(platoon);
                  setSelectedPlatoons(next);
                }}
              />
              {platoon}
            </label>
          ))}
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button className="primary-button">שמירה</button>
        </div>
      </form>
    </Modal>
  );
}
