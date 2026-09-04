import { holdingsForSoldier, numberedItemsForSoldier } from "../../domain/rules";
import { catalogKey, itemLabel } from "../../domain/schema";
import type { CatalogItem, CompanyData, NumberedItem, SignatureSummary, Soldier } from "../../domain/types";
import whatsappIconUrl from "../../assets/whatsapp.svg";
import { displayDate } from "../../app/format";
import { EmptyList, Modal } from "../../components/ui";

export function SoldierDetail({
  data,
  soldier,
  editable,
  onClose,
  onNumbered,
  onQuantity,
  onShare,
  onOpenSigning,
  onSignature,
}: {
  data: CompanyData;
  soldier: Soldier;
  editable: boolean;
  onClose: () => void;
  onNumbered: (
    item: NumberedItem,
    mode: "assign" | "return" | "status",
  ) => void;
  onQuantity: (item: CatalogItem, mode: "return" | "transfer") => void;
  onShare: () => void;
  onOpenSigning: () => void;
  onSignature: (signature: SignatureSummary) => void;
}) {
  const numbered = numberedItemsForSoldier(
    data.numberedItems,
    soldier.personalNumber,
  );
  const holdings = holdingsForSoldier(data.holdings, soldier.personalNumber);
  const history = [...data.movements]
    .reverse()
    .filter(
      (entry) =>
        entry.previousSoldier === soldier.personalNumber ||
        entry.newSoldier === soldier.personalNumber,
    );
  const signatures = [...data.signatures]
    .reverse()
    .filter(
      (signature) => signature.personalNumber === soldier.personalNumber,
    );
  return (
    <Modal title={soldier.name} onClose={onClose}>
      <p>
        מספר אישי <bdi>{soldier.personalNumber}</bdi> · מחלקה {soldier.platoon}
        {soldier.phone && (
          <>
            {" "}
            · טלפון <bdi>{soldier.phone}</bdi>
          </>
        )}
      </p>
      <div className="soldier-detail-primary-actions">
        {editable && (
          <button
            type="button"
            className="primary-button"
            onClick={onOpenSigning}
          >
            פתיחת החתמה
          </button>
        )}
        <button
          className="icon-button share-button"
          type="button"
          title="שיתוף תנועות ב-WhatsApp"
          aria-label={`שיתוף התנועות של ${soldier.name} ב-WhatsApp`}
          onClick={onShare}
        >
          <img src={whatsappIconUrl} alt="" />
        </button>
      </div>
      <h3>ציוד נוכחי</h3>
      <div className="cards-list compact">
        {numbered.map((item) => (
          <article className="list-card" key={`${item.type}-${item.number}`}>
            <div>
                  <strong>
                    {itemLabel(item.type, item.variant)} · {item.number}
                  </strong>
                  {item.location && <p>מיקום: {item.location}</p>}
            </div>
            {editable && (
              <div className="card-actions">
                <button
                  className="small-button"
                  onClick={() => onNumbered(item, "return")}
                >
                  החזרה
                </button>
                <button
                  className="small-button"
                  onClick={() => onNumbered(item, "assign")}
                >
                  העברה
                </button>
              </div>
            )}
          </article>
        ))}
        {holdings.map((holding) => {
          const item = data.catalog.find(
            (candidate) =>
              catalogKey(candidate.type, candidate.variant) ===
              catalogKey(holding.type, holding.variant),
          );
          return (
            item && (
              <article
                className="list-card"
                key={catalogKey(holding.type, holding.variant)}
              >
                <div>
                  <strong>
                    {itemLabel(item.type, item.variant, item.variantLabel)}
                  </strong>
                  <p>{holding.quantity} יח׳</p>
                </div>
                {editable && (
                  <div className="card-actions">
                    <button
                      className="small-button"
                      onClick={() => onQuantity(item, "return")}
                    >
                      החזרה
                    </button>
                    <button
                      className="small-button"
                      onClick={() => onQuantity(item, "transfer")}
                    >
                      העברה
                    </button>
                  </div>
                )}
              </article>
            )
          );
        })}
        {!numbered.length && !holdings.length && (
          <EmptyList>אין ציוד מוחזק.</EmptyList>
        )}
      </div>
      <h3>חתימות</h3>
      <div className="history-list signature-summary-list">
        {signatures.map((signature) => (
          <article key={signature.row}>
            <div className="history-card-heading">
              <div>
                <strong>פעולת החתמה</strong>
                <small>
                  {displayDate(signature.timestamp)} · {signature.actor}
                </small>
              </div>
              <button
                type="button"
                className="small-button"
                onClick={() => onSignature(signature)}
              >
                הצגת חתימה
              </button>
            </div>
          </article>
        ))}
        {!signatures.length && <EmptyList>אין חתימות לחייל.</EmptyList>}
      </div>
      <h3>היסטוריה</h3>
      <div className="history-list">
        {history.map((entry) => (
          <article key={entry.row}>
            <strong>{entry.action}</strong>
            <span>
              {itemLabel(entry.type, entry.variant)} {entry.number}
              {entry.quantity > 0 && ` · כמות ${entry.quantity}`}
            </span>
            <small>{displayDate(entry.timestamp)}</small>
          </article>
        ))}
        {!history.length && <EmptyList>אין היסטוריה לחייל.</EmptyList>}
      </div>
    </Modal>
  );
}
