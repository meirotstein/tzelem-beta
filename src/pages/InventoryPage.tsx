import { useState } from "react";
import { availableQuantity, catalogActualQuantity, issuedQuantity } from "../domain/rules";
import { canAccessMethod, hasAllPlatoons } from "../domain/permissions";
import { catalogKey, itemLabel } from "../domain/schema";
import { buildInventoryWhatsAppMessage, shareOnWhatsApp } from "../domain/sharing";
import type { CatalogItem, CompanyData, NumberedItem, UserAccess } from "../domain/types";
import { EQUIPMENT_STATUSES, MANAGEMENT_METHODS } from "../domain/types";
import type { Action } from "../app/types";
import { statusClass } from "../app/format";
import whatsappIconUrl from "../assets/whatsapp.svg";
import { EmptyList } from "../components/ui";

export function InventoryView({
  data,
  stockHoldings,
  editable,
  access,
  onAddCatalog,
  onManageGroups,
  onAddNumbered,
  onCatalog,
  onCatalogEdit,
  onNumberedEdit,
  onAction,
  onCatalogToggle,
  onNumberedToggle,
}: {
  data: CompanyData;
  stockHoldings: CompanyData["holdings"];
  editable: boolean;
  access: UserAccess;
  onAddCatalog: () => void;
  onManageGroups: () => void;
  onAddNumbered: () => void;
  onCatalog: (item: CatalogItem) => void;
  onCatalogEdit: (item: CatalogItem) => void;
  onNumberedEdit: (item: NumberedItem) => void;
  onAction: (action: Exclude<Action, null>) => void;
  onCatalogToggle: (item: CatalogItem) => void;
  onNumberedToggle: (item: NumberedItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [platoon, setPlatoon] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const canManageInventory = hasAllPlatoons(access);
  const holderMatches = (personalNumber: string) =>
    !platoon ||
    data.soldiers.find((soldier) => soldier.personalNumber === personalNumber)
      ?.platoon === platoon;
  const numbered = data.numberedItems.filter(
    (item) =>
      (showArchived || item.active) &&
      (!type || item.type === type) &&
      (!method || method === "צל״מ") &&
      (!status || item.status === status) &&
      (!platoon || holderMatches(item.assignedTo)) &&
      (!query ||
        `${item.type} ${item.variant} ${item.number} ${item.location}`.includes(
          query.trim(),
        )),
  );
  const quantity = data.catalog.filter(
    (item) =>
      item.method === "כמותי" &&
      (showArchived || item.active) &&
      (!type || item.type === type) &&
      (!method || method === "כמותי") &&
      !status &&
      (!query ||
        `${item.type} ${item.variant} ${item.location}`.includes(query.trim())) &&
      (!platoon ||
        data.holdings.some(
          (holding) =>
            holding.type === item.type &&
            holding.variant === item.variant &&
            holderMatches(holding.personalNumber),
        )),
  );
  const standards = data.catalog.filter(
    (item) => item.active && item.standard != null,
  );
  const filters = { query, type, method, status, platoon, showArchived };
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>מלאי ציוד</h1>
          <p>
            {numbered.length} פריטי צל״מ · {quantity.length} סוגים כמותיים
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="icon-button share-button"
            title="שיתוף ב-WhatsApp"
            aria-label="שיתוף מלאי הציוד ב-WhatsApp"
            onClick={() =>
              shareOnWhatsApp(
                buildInventoryWhatsAppMessage(
                  data,
                  numbered,
                  quantity,
                  filters,
                ),
              )
            }
          >
            <img src={whatsappIconUrl} alt="" />
          </button>
          {editable && (
            <>
              {canManageInventory && (
                <>
                  {canAccessMethod(access, "כמותי") && (
                    <button
                      className="secondary-button"
                      onClick={onManageGroups}
                    >
                      ערכות ציוד
                    </button>
                  )}
                  <button className="secondary-button" onClick={onAddCatalog}>
                    סוג ציוד חדש
                  </button>
                </>
              )}
              {canAccessMethod(access, "צל״מ") && (
                <button className="primary-button" onClick={onAddNumbered}>
                  פריט צל״מ חדש
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="filters">
        <input
          placeholder="חיפוש סוג, מאפיין, מספר או מיקום"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          <option value="">כל שיטות הניהול</option>
          {MANAGEMENT_METHODS.filter((value) =>
            canAccessMethod(access, value),
          ).map((value) => (
              <option key={value}>{value}</option>
            ))}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">כל הסוגים</option>
          {[...new Set(data.catalog.map((item) => item.type))].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">כל הסטטוסים</option>
          {EQUIPMENT_STATUSES.map((value) => (
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
        <label className="check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          כולל שהוסרו
        </label>
      </div>
      {standards.length > 0 && (
        <div className="standard-overview" aria-label="מצב עמידה בתקן">
          {standards.map((item) => {
            const actual = catalogActualQuantity(item, data.numberedItems);
            const missing = Math.max(0, (item.standard ?? 0) - actual);
            return (
              <article key={catalogKey(item.type, item.variant)}>
                <strong>
                  {itemLabel(item.type, item.variant, item.variantLabel)}
                </strong>
                <span>
                  בפועל {actual} מתוך תקן {item.standard}
                </span>
                <span className={`status ${missing ? "danger" : "success"}`}>
                  {missing ? `חסרים ${missing}` : "עומדים בתקן"}
                </span>
              </article>
            );
          })}
        </div>
      )}
      <div className="cards-list">
        {numbered.map((item) => {
          const holder = data.soldiers.find(
            (soldier) => soldier.personalNumber === item.assignedTo,
          );
          return (
            <article
              className={`list-card ${item.active ? "" : "archived"}`}
              key={`${item.type}-${item.number}`}
            >
              <div>
                <h3>
                  {itemLabel(item.type, item.variant)} ·{" "}
                  <bdi>{item.number}</bdi>
                </h3>
                <p>
                  {holder
                    ? `${holder.name} · מחלקה ${holder.platoon}`
                    : "לא משויך"}
                  {item.location ? ` · מיקום ${item.location}` : ""}
                </p>
                <span className={`status ${statusClass(item.status)}`}>
                  {item.status}
                </span>
              </div>
              {editable && (
                <div className="card-actions">
                  <button
                    className="small-button"
                    onClick={() =>
                      onAction({ kind: "numbered", item, mode: "assign" })
                    }
                  >
                    {item.assignedTo ? "העברה" : "החתמה"}
                  </button>
                  {item.assignedTo && (
                    <button
                      className="small-button"
                      onClick={() =>
                        onAction({ kind: "numbered", item, mode: "return" })
                      }
                    >
                      החזרה
                    </button>
                  )}
                  <button
                    className="small-button"
                    onClick={() =>
                      onAction({ kind: "numbered", item, mode: "status" })
                    }
                  >
                    סטטוס
                  </button>
                  {canManageInventory && (
                    <>
                      <button
                        className="small-button"
                        onClick={() => onNumberedEdit(item)}
                      >
                        עריכה
                      </button>
                      <button
                        className="small-button danger-text"
                        onClick={() => onNumberedToggle(item)}
                      >
                        {item.active ? "הסר" : "הפעל"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {quantity.map((item) => (
          <article
            className={`list-card quantity-card ${item.active ? "" : "archived"}`}
            key={catalogKey(item.type, item.variant)}
            onClick={() => onCatalog(item)}
          >
            <div>
              <h3>{itemLabel(item.type, item.variant, item.variantLabel)}</h3>
              <p>
                כמותי{item.location ? ` · מיקום ${item.location}` : ""}
              </p>
              <div className="inventory-numbers">
                <span>
                  מלאי <strong>{item.totalStock}</strong>
                </span>
                <span>
                  מוחזק <strong>{issuedQuantity(item, stockHoldings)}</strong>
                </span>
                <span>
                  זמין <strong>{availableQuantity(item, stockHoldings)}</strong>
                </span>
                {item.standard != null && (
                  <span>
                    תקן <strong>{item.standard}</strong> · חסרים{" "}
                    <strong>{Math.max(0, item.standard - item.totalStock)}</strong>
                  </span>
                )}
              </div>
            </div>
            {editable && (
              <div
                className="card-actions"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="small-button"
                  onClick={() =>
                    onAction({ kind: "quantity", item, mode: "issue" })
                  }
                >
                  החתמה
                </button>
                {canManageInventory && (
                  <>
                    <button
                      className="small-button"
                      onClick={() => onAction({ kind: "stock", item })}
                    >
                      עדכון מלאי
                    </button>
                    <button
                      className="small-button"
                      onClick={() => onCatalogEdit(item)}
                    >
                      עריכה
                    </button>
                    <button
                      className="small-button danger-text"
                      onClick={() => onCatalogToggle(item)}
                    >
                      {item.active ? "הסר" : "הפעל"}
                    </button>
                  </>
                )}
              </div>
            )}
          </article>
        ))}
        {!numbered.length && !quantity.length && (
          <EmptyList>לא נמצא ציוד.</EmptyList>
        )}
      </div>
    </section>
  );
}
