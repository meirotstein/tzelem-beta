import { useState } from "react";
import { holdingsForSoldier, numberedItemsForSoldier, soldierHasEquipment } from "../domain/rules";
import { buildSoldiersWhatsAppMessage, shareOnWhatsApp } from "../domain/sharing";
import type { CompanyData, Soldier } from "../domain/types";
import whatsappIconUrl from "../assets/whatsapp.svg";
import { EmptyList } from "../components/ui";

export function SoldiersView({
  data,
  editable,
  onAdd,
  onEdit,
  onOpen,
  onToggle,
}: {
  data: CompanyData;
  editable: boolean;
  onAdd: () => void;
  onEdit: (soldier: Soldier) => void;
  onOpen: (soldier: Soldier) => void;
  onToggle: (soldier: Soldier) => void;
}) {
  const [query, setQuery] = useState("");
  const [platoon, setPlatoon] = useState("");
  const [equipmentState, setEquipmentState] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const filtered = data.soldiers.filter(
    (soldier) =>
      (showArchived || soldier.active) &&
      (!platoon || soldier.platoon === platoon) &&
      (!query ||
        `${soldier.name} ${soldier.personalNumber} ${soldier.phone}`.includes(
          query.trim(),
        )) &&
      (!equipmentState ||
        (equipmentState === "assigned") ===
          soldierHasEquipment(soldier, data.numberedItems, data.holdings)),
  );
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>חיילים</h1>
          <p>{filtered.length} תוצאות</p>
        </div>
        <div className="heading-actions">
          <button
            className="icon-button share-button"
            title="שיתוף ב-WhatsApp"
            aria-label="שיתוף רשימת החיילים ב-WhatsApp"
            onClick={() =>
              shareOnWhatsApp(
                buildSoldiersWhatsAppMessage(data, filtered, {
                  query,
                  platoon,
                  equipmentState,
                  showArchived,
                }),
              )
            }
          >
            <img src={whatsappIconUrl} alt="" />
          </button>
          {editable && (
            <button className="primary-button" onClick={onAdd}>
              הוספת חייל
            </button>
          )}
        </div>
      </div>
      <div className="filters">
        <input
          placeholder="חיפוש שם, מספר אישי או טלפון"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
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
          value={equipmentState}
          onChange={(event) => setEquipmentState(event.target.value)}
        >
          <option value="">עם וללא ציוד</option>
          <option value="assigned">עם ציוד</option>
          <option value="none">ללא ציוד</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          כולל שהוסרו
        </label>
      </div>
      <div className="cards-list">
        {filtered.map((soldier) => {
          const numbered = numberedItemsForSoldier(
            data.numberedItems,
            soldier.personalNumber,
          );
          const quantities = holdingsForSoldier(
            data.holdings,
            soldier.personalNumber,
          );
          return (
            <article
              className={`list-card ${soldier.active ? "" : "archived"}`}
              key={soldier.personalNumber}
              onClick={() => onOpen(soldier)}
            >
              <div>
                <h3>{soldier.name}</h3>
                <p>
                  <bdi>{soldier.personalNumber}</bdi> · מחלקה {soldier.platoon}
                </p>
                {soldier.phone && (
                  <small>
                    טלפון: <bdi>{soldier.phone}</bdi>
                  </small>
                )}
                <small>
                  {numbered.length} פריטי צל״מ ·{" "}
                  {quantities.reduce(
                    (sum, holding) => sum + holding.quantity,
                    0,
                  )}{" "}
                  יחידות כמותיות
                </small>
              </div>
              {editable && (
                <div
                  className="card-actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    className="small-button"
                    onClick={() => onEdit(soldier)}
                  >
                    עריכה
                  </button>
                  <button
                    className="small-button danger-text"
                    onClick={() => onToggle(soldier)}
                  >
                    {soldier.active ? "הסרה" : "הפעלה"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!filtered.length && <EmptyList>לא נמצאו חיילים.</EmptyList>}
      </div>
    </section>
  );
}
