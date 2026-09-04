import { availableQuantity, issuedQuantity } from "../../domain/rules";
import { catalogKey, itemLabel } from "../../domain/schema";
import { displayDate } from "../../app/format";
import type { Action } from "../../app/types";
import type { CatalogItem, CompanyData } from "../../domain/types";
import { EmptyList, Modal } from "../../components/ui";

export function CatalogDetail({
  data,
  stockHoldings,
  item,
  editable,
  canManageStock,
  onClose,
  onAction,
}: {
  data: CompanyData;
  stockHoldings: CompanyData["holdings"];
  item: CatalogItem;
  editable: boolean;
  canManageStock: boolean;
  onClose: () => void;
  onAction: (action: Exclude<Action, null>) => void;
}) {
  const holdings = data.holdings.filter(
    (holding) =>
      holding.type === item.type &&
      holding.variant === item.variant &&
      holding.quantity > 0,
  );
  const history = [...data.movements]
    .reverse()
    .filter(
      (entry) =>
        catalogKey(entry.type, entry.variant) ===
        catalogKey(item.type, item.variant),
    );
  return (
    <Modal
      title={itemLabel(item.type, item.variant, item.variantLabel)}
      onClose={onClose}
    >
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
      </div>
      {item.location && <p>מיקום: {item.location}</p>}
      {item.standard != null && (
        <p>
          תקן: {item.standard} · חסרים{" "}
          {Math.max(0, item.standard - item.totalStock)}
        </p>
      )}
      {editable && (
        <div className="quick-actions">
          <button
            className="primary-button"
            onClick={() => onAction({ kind: "quantity", item, mode: "issue" })}
          >
            החתמה
          </button>
          {canManageStock && (
            <button
              className="secondary-button"
              onClick={() => onAction({ kind: "stock", item })}
            >
              עדכון מלאי
            </button>
          )}
        </div>
      )}
      <h3>מחזיקים</h3>
      <div className="cards-list compact">
        {holdings.map((holding) => {
          const soldier = data.soldiers.find(
            (candidate) => candidate.personalNumber === holding.personalNumber,
          );
          return (
            <article className="list-card" key={holding.personalNumber}>
              <div>
                <strong>{soldier?.name || holding.personalNumber}</strong>
                <p>
                  {soldier?.platoon && `מחלקה ${soldier.platoon} · `}
                  {holding.quantity} יח׳
                </p>
              </div>
              {editable && soldier && (
                <div className="card-actions">
                  <button
                    className="small-button"
                    onClick={() =>
                      onAction({
                        kind: "quantity",
                        item,
                        mode: "return",
                        soldier,
                      })
                    }
                  >
                    החזרה
                  </button>
                  <button
                    className="small-button"
                    onClick={() =>
                      onAction({
                        kind: "quantity",
                        item,
                        mode: "transfer",
                        soldier,
                      })
                    }
                  >
                    העברה
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!holdings.length && <EmptyList>אין החזקות פעילות.</EmptyList>}
      </div>
      <h3>היסטוריה</h3>
      <div className="history-list">
        {history.map((entry) => (
          <article key={entry.row}>
            <strong>{entry.action}</strong>
            <span>
              {entry.number && `${entry.number} · `}
              {entry.quantity > 0 && `כמות ${entry.quantity}`}
            </span>
            <small>{displayDate(entry.timestamp)}</small>
          </article>
        ))}
        {!history.length && <EmptyList>אין היסטוריה לסוג הציוד.</EmptyList>}
      </div>
    </Modal>
  );
}
