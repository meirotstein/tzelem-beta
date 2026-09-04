import { useState } from "react";
import { activeCatalogItemsForMethod } from "../../domain/rules";
import { catalogKey, itemLabel } from "../../domain/schema";
import type { CompanyData, EquipmentGroup, EquipmentGroupInput } from "../../domain/types";
import { EmptyList, Field, Modal } from "../../components/ui";

export function EquipmentGroupsModal({
  data,
  editable,
  saving,
  onClose,
  onSave,
  onToggle,
}: {
  data: CompanyData;
  editable: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (
    group: EquipmentGroup | undefined,
    input: EquipmentGroupInput,
  ) => Promise<boolean>;
  onToggle: (group: EquipmentGroup) => void;
}) {
  const [editing, setEditing] = useState<EquipmentGroup | "new" | null>(null);
  if (editing) {
    return (
      <EquipmentGroupFormModal
        data={data}
        group={editing === "new" ? undefined : editing}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          const saved = await onSave(
            editing === "new" ? undefined : editing,
            input,
          );
          if (saved) setEditing(null);
        }}
      />
    );
  }
  return (
    <Modal title="ערכות ציוד" onClose={onClose}>
      <div className="section-heading">
        <p>ערכות מוסיפות כמה פריטים כמותיים יחד לטיוטת ההחתמה.</p>
        {editable && (
          <button
            type="button"
            className="primary-button"
            onClick={() => setEditing("new")}
          >
            ערכה חדשה
          </button>
        )}
      </div>
      <div className="cards-list compact">
        {data.equipmentGroups.map((group) => {
          const components = data.equipmentGroupItems.filter(
            (item) => item.groupName === group.name && item.active,
          );
          const total = components.reduce(
            (sum, item) => sum + item.quantity,
            0,
          );
          return (
            <article
              className={`list-card ${group.active ? "" : "archived"}`}
              key={group.name}
            >
              <div>
                <strong>{group.name}</strong>
                <p>
                  {components.length} סוגי ציוד · {total} יח׳
                </p>
                {group.note && <small>{group.note}</small>}
                <div className="group-component-summary">
                  {components.map((component) => {
                    const catalog = data.catalog.find(
                      (item) =>
                        catalogKey(item.type, item.variant) ===
                        catalogKey(component.type, component.variant),
                    );
                    return (
                      <span key={catalogKey(component.type, component.variant)}>
                        {itemLabel(
                          component.type,
                          component.variant,
                          catalog?.variantLabel,
                        )} {component.quantity} יח׳
                      </span>
                    );
                  })}
                </div>
              </div>
              {editable && (
                <div className="card-actions">
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => setEditing(group)}
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    className="small-button danger-text"
                    onClick={() => onToggle(group)}
                  >
                    {group.active ? "הסרה" : "הפעלה"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!data.equipmentGroups.length && <EmptyList>לא הוגדרו ערכות.</EmptyList>}
      </div>
    </Modal>
  );
}

export function EquipmentGroupFormModal({
  data,
  group,
  saving,
  onClose,
  onSave,
}: {
  data: CompanyData;
  group?: EquipmentGroup;
  saving: boolean;
  onClose: () => void;
  onSave: (input: EquipmentGroupInput) => void;
}) {
  const catalog = activeCatalogItemsForMethod(data.catalog, "כמותי");
  const initialItems = group
    ? data.equipmentGroupItems
        .filter((item) => item.groupName === group.name && item.active)
        .map((item) => ({
          key: catalogKey(item.type, item.variant),
          quantity: String(item.quantity),
        }))
    : [];
  const [name, setName] = useState(group?.name || "");
  const [note, setNote] = useState(group?.note || "");
  const [items, setItems] = useState(initialItems);
  const [selectedKey, setSelectedKey] = useState("");
  const [quantity, setQuantity] = useState("1");
  const selectedKeys = new Set(items.map((item) => item.key));
  const parsedItems = items.flatMap((component) => {
    const item = catalog.find(
      (candidate) => catalogKey(candidate.type, candidate.variant) === component.key,
    );
    return item
      ? [{ type: item.type, variant: item.variant, quantity: Number(component.quantity) }]
      : [];
  });
  const formValid =
    Boolean(name.trim()) &&
    parsedItems.length > 0 &&
    parsedItems.length === items.length &&
    parsedItems.every(
      (item) => Number.isInteger(item.quantity) && item.quantity > 0,
    );
  return (
    <Modal title={group ? `עריכת ${group.name}` : "ערכה חדשה"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (formValid) onSave({ name, note, items: parsedItems });
        }}
      >
        <Field label="שם ערכה">
          <input
            required
            disabled={Boolean(group)}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="הערה (אופציונלי)">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <h3>פריטי הערכה</h3>
        <div className="group-form-items">
          {items.map((component) => {
            const item = catalog.find(
              (candidate) =>
                catalogKey(candidate.type, candidate.variant) === component.key,
            );
            return (
              <div className="group-form-item" key={component.key}>
                <span>
                  {item
                    ? itemLabel(item.type, item.variant, item.variantLabel)
                    : "פריט לא זמין"}
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  aria-label={`כמות ${item?.type || "פריט"}`}
                  value={component.quantity}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((candidate) =>
                        candidate.key === component.key
                          ? { ...candidate, quantity: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="small-button danger-text"
                  onClick={() =>
                    setItems((current) =>
                      current.filter((candidate) => candidate.key !== component.key),
                    )
                  }
                >
                  הסרה
                </button>
              </div>
            );
          })}
          {!items.length && <EmptyList>יש להוסיף לפחות פריט אחד.</EmptyList>}
        </div>
        <div className="group-add-row">
          <Field label="ציוד כמותי">
            <select
              value={selectedKey}
              onChange={(event) => setSelectedKey(event.target.value)}
            >
              <option value="">בחירה</option>
              {catalog
                .filter(
                  (item) =>
                    !selectedKeys.has(catalogKey(item.type, item.variant)),
                )
                .map((item) => (
                  <option
                    key={catalogKey(item.type, item.variant)}
                    value={catalogKey(item.type, item.variant)}
                  >
                    {itemLabel(item.type, item.variant, item.variantLabel)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="כמות">
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="secondary-button"
            disabled={
              !selectedKey ||
              !Number.isInteger(Number(quantity)) ||
              Number(quantity) <= 0
            }
            onClick={() => {
              setItems((current) => [
                ...current,
                { key: selectedKey, quantity },
              ]);
              setSelectedKey("");
              setQuantity("1");
            }}
          >
            הוספה לערכה
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            ביטול
          </button>
          <button className="primary-button" disabled={saving || !formValid}>
            שמירה
          </button>
        </div>
      </form>
    </Modal>
  );
}
