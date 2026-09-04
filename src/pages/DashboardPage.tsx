import { catalogActualQuantity, soldiersWithoutEquipment } from "../domain/rules";
import { canAccessMethod } from "../domain/permissions";
import { itemLabel } from "../domain/schema";
import type { CompanyData, UserAccess } from "../domain/types";
import type { View } from "../app/types";
import { displayDate } from "../app/format";
import { EmptyList } from "../components/ui";

export function Dashboard({
  data,
  editable,
  access,
  onView,
  onAddSoldier,
  onAddNumbered,
  onIssue,
}: {
  data: CompanyData;
  editable: boolean;
  access: UserAccess;
  onView: (view: View) => void;
  onAddSoldier: () => void;
  onAddNumbered: () => void;
  onIssue: () => void;
}) {
  const activeNumbered = data.numberedItems.filter((item) => item.active);
  const quantityTotal = data.catalog
    .filter((item) => item.active && item.method === "כמותי")
    .reduce((sum, item) => sum + item.totalStock, 0);
  const quantityIssued = data.holdings.reduce(
    (sum, holding) => sum + holding.quantity,
    0,
  );
  const belowStandard = data.catalog.filter((item) => {
    if (!item.active || item.standard == null) return false;
    return catalogActualQuantity(item, data.numberedItems) < item.standard;
  }).length;
  const cards = [
    ["פריטי צל״מ", activeNumbered.length],
    ["צל״מ משויך", activeNumbered.filter((item) => item.assignedTo).length],
    [
      "צל״מ זמין",
      activeNumbered.filter((item) => item.status === "זמין").length,
    ],
    ["יחידות כמותיות", quantityTotal],
    ["יחידות מוחזקות", quantityIssued],
    ["סוגים בחוסר לתקן", belowStandard],
    [
      "תקול / בתיקון",
      activeNumbered.filter((item) => ["תקול", "בתיקון"].includes(item.status))
        .length,
    ],
    ["אבוד", activeNumbered.filter((item) => item.status === "אבוד").length],
    [
      "חיילים ללא ציוד",
      soldiersWithoutEquipment(data.soldiers, data.numberedItems, data.holdings)
        .length,
    ],
  ];
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>תמונת מצב</h1>
          <p>המצב הנוכחי של הציוד הפלוגתי</p>
        </div>
      </div>
      <div className="stats-grid">
        {cards.map(([label, value]) => (
          <article className="stat-card" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
      {editable && (
        <div className="quick-actions">
          <button className="primary-button" onClick={onIssue}>
            החתמת ציוד
          </button>
          <button className="secondary-button" onClick={onAddSoldier}>
            הוספת חייל
          </button>
          {canAccessMethod(access, "צל״מ") && (
            <button className="secondary-button" onClick={onAddNumbered}>
              הוספת פריט צל״מ
            </button>
          )}
        </div>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>פעילות אחרונה</h2>
          <button className="text-button" onClick={() => onView("history")}>
            לכל התנועות
          </button>
        </div>
        {data.movements.length ? (
          <div className="activity-list">
            {[...data.movements]
              .reverse()
              .slice(0, 8)
              .map((entry) => (
                <div key={entry.row}>
                  <strong>{entry.action}</strong>
                  <span>
                    {itemLabel(entry.type, entry.variant)} {entry.number}{" "}
                    {entry.quantity ? `× ${entry.quantity}` : ""}
                  </span>
                  <small>{displayDate(entry.timestamp)}</small>
                </div>
              ))}
          </div>
        ) : (
          <EmptyList>אין עדיין פעילות.</EmptyList>
        )}
      </section>
    </section>
  );
}
