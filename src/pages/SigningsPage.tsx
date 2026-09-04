import { useEffect, useMemo, useState } from "react";
import { activeCatalogItemsForMethod, availableQuantity, fuzzyScore } from "../domain/rules";
import { catalogKey, itemLabel, numberedItemKey } from "../domain/schema";
import type { CatalogItem, CompanyData, MovementEntry, NumberedItem, SigningSessionInput, Soldier } from "../domain/types";
import type { ConfirmationRequest, SigningSeed } from "../app/types";
import { EmptyList, Field } from "../components/ui";
import { SignatureModal } from "../features/signatures/SignatureComponents";

export function SigningsView({
  data,
  editable,
  saving,
  canAddCatalogType,
  canAddNumberedItem,
  onAddCatalogType,
  onAddNumberedItem,
  initialSoldier,
  initialItem,
  onInitialItemApplied,
  onDirtyChange,
  onRequestDiscard,
  onRequestConfirmation,
  onError,
  onSave,
}: {
  data: CompanyData;
  editable: boolean;
  saving: boolean;
  canAddCatalogType: boolean;
  canAddNumberedItem: boolean;
  onAddCatalogType: () => void;
  onAddNumberedItem: () => void;
  initialSoldier: Soldier | null;
  initialItem: SigningSeed | null;
  onInitialItemApplied: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onRequestDiscard: (onConfirm: () => void) => void;
  onRequestConfirmation: (request: ConfirmationRequest) => void;
  onError: (message: string) => void;
  onSave: (soldier: Soldier, input: SigningSessionInput) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [selectedSoldier, setSelectedSoldier] =
    useState<Soldier | null>(initialSoldier);
  const [selectedNumbered, setSelectedNumbered] = useState<Set<string>>(
    new Set(),
  );
  const [quantityValues, setQuantityValues] = useState<Record<string, string>>(
    {},
  );
  const [numberedToAdd, setNumberedToAdd] = useState("");
  const [quantityToAdd, setQuantityToAdd] = useState("");
  const [addQuantity, setAddQuantity] = useState("1");
  const [groupToAdd, setGroupToAdd] = useState("");
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);
  const [pendingInitialItem, setPendingInitialItem] =
    useState<SigningSeed | null>(initialItem);
  const [transferSeed, setTransferSeed] = useState<SigningSeed | null>(
    initialItem?.kind === "numberedTransfer" ||
      initialItem?.kind === "quantityTransfer"
      ? initialItem
      : null,
  );
  const [pendingSigning, setPendingSigning] = useState<Omit<
    SigningSessionInput,
    "signature"
  > | null>(null);
  const pendingInitialItemLabel = pendingInitialItem
    ? pendingInitialItem.kind === "numbered" ||
      pendingInitialItem.kind === "numberedTransfer"
      ? `${itemLabel(
          pendingInitialItem.item.type,
          pendingInitialItem.item.variant,
        )} · ${pendingInitialItem.item.number}`
      : itemLabel(
          pendingInitialItem.item.type,
          pendingInitialItem.item.variant,
          pendingInitialItem.item.variantLabel,
        )
    : "";

  const soldierMatches = useMemo(
    () =>
      data.soldiers
        .filter((soldier) => soldier.active)
        .map((soldier) => ({
          soldier,
          score: fuzzyScore(
            `${soldier.name} ${soldier.personalNumber} ${soldier.phone} ${soldier.platoon}`,
            query,
          ),
        }))
        .filter((match) => match.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.soldier.name.localeCompare(right.soldier.name, "he"),
        )
        .slice(0, 12),
    [data.soldiers, query],
  );

  useEffect(() => {
    if (!selectedSoldier) {
      setSelectedNumbered(new Set());
      setQuantityValues({});
      return;
    }
    const nextNumbered = new Set(
      data.numberedItems
        .filter(
          (item) =>
            item.active && item.assignedTo === selectedSoldier.personalNumber,
        )
        .map((item) => numberedItemKey(item.type, item.number)),
    );
    const nextQuantities = Object.fromEntries(
      data.holdings
        .filter(
          (holding) =>
            holding.personalNumber === selectedSoldier.personalNumber &&
            holding.quantity > 0,
        )
        .map((holding) => [
          catalogKey(holding.type, holding.variant),
          String(holding.quantity),
        ]),
    );
    if (
      pendingInitialItem?.kind === "numbered" ||
      pendingInitialItem?.kind === "numberedTransfer"
    ) {
      const seededItem = data.numberedItems.find(
        (item) =>
          numberedItemKey(item.type, item.number) ===
          numberedItemKey(
            pendingInitialItem.item.type,
            pendingInitialItem.item.number,
          ),
      );
      const canAdd =
        pendingInitialItem.kind === "numberedTransfer"
          ? seededItem?.active &&
            seededItem.assignedTo === pendingInitialItem.from.personalNumber &&
            seededItem.assignedTo !== selectedSoldier.personalNumber
          : seededItem?.active &&
            seededItem.status === "זמין" &&
            !seededItem.assignedTo;
      if (canAdd && seededItem)
        nextNumbered.add(numberedItemKey(seededItem.type, seededItem.number));
    }
    if (pendingInitialItem?.kind === "quantity") {
      const seededItem = data.catalog.find(
        (item) =>
          catalogKey(item.type, item.variant) ===
          catalogKey(
            pendingInitialItem.item.type,
            pendingInitialItem.item.variant,
          ),
      );
      if (
        seededItem?.active &&
        seededItem.method === "כמותי" &&
        availableQuantity(seededItem, data.holdings) > 0
      ) {
        const key = catalogKey(seededItem.type, seededItem.variant);
        nextQuantities[key] = String(Number(nextQuantities[key] || 0) + 1);
      }
    }
    if (pendingInitialItem?.kind === "quantityTransfer") {
      const seededItem = data.catalog.find(
        (item) =>
          catalogKey(item.type, item.variant) ===
          catalogKey(
            pendingInitialItem.item.type,
            pendingInitialItem.item.variant,
          ),
      );
      const sourceHolding = data.holdings.find(
        (holding) =>
          holding.personalNumber === pendingInitialItem.from.personalNumber &&
          catalogKey(holding.type, holding.variant) ===
            catalogKey(
              pendingInitialItem.item.type,
              pendingInitialItem.item.variant,
            ),
      );
      if (
        seededItem?.active &&
        seededItem.method === "כמותי" &&
        sourceHolding &&
        sourceHolding.quantity >= pendingInitialItem.quantity
      ) {
        const key = catalogKey(seededItem.type, seededItem.variant);
        nextQuantities[key] = String(
          Number(nextQuantities[key] || 0) + pendingInitialItem.quantity,
        );
      }
    }
    setSelectedNumbered(nextNumbered);
    setQuantityValues(nextQuantities);
    if (pendingInitialItem) {
      setPendingInitialItem(null);
      onInitialItemApplied();
    }
    setNumberedToAdd("");
    setQuantityToAdd("");
    setAddQuantity("1");
    setShowOnlyChanged(false);
  }, [selectedSoldier?.personalNumber]);

  useEffect(() => {
    if (!initialItem || !selectedSoldier) return;
    if (initialItem.kind === "numbered") {
      const createdItem = data.numberedItems.find(
        (item) =>
          numberedItemKey(item.type, item.number) ===
          numberedItemKey(initialItem.item.type, initialItem.item.number),
      );
      if (
        createdItem?.active &&
        createdItem.status === "זמין" &&
        !createdItem.assignedTo
      ) {
        setSelectedNumbered((current) =>
          new Set([
            ...current,
            numberedItemKey(createdItem.type, createdItem.number),
          ]),
        );
      }
    }
    setPendingInitialItem(null);
    onInitialItemApplied();
  }, [
    data.numberedItems,
    initialItem,
    onInitialItemApplied,
    selectedSoldier,
  ]);

  const hasDraftChanges = useMemo(() => {
    if (!selectedSoldier) return false;
    const currentNumberedKeys = new Set(
      data.numberedItems
        .filter(
          (item) =>
            item.active && item.assignedTo === selectedSoldier.personalNumber,
        )
        .map((item) => numberedItemKey(item.type, item.number)),
    );
    if (
      currentNumberedKeys.size !== selectedNumbered.size ||
      [...currentNumberedKeys].some((key) => !selectedNumbered.has(key))
    )
      return true;
    return activeCatalogItemsForMethod(data.catalog, "כמותי").some((item) => {
      const key = catalogKey(item.type, item.variant);
      const current =
        data.holdings.find(
          (holding) =>
            holding.personalNumber === selectedSoldier.personalNumber &&
            catalogKey(holding.type, holding.variant) === key,
        )?.quantity || 0;
      return Number(quantityValues[key] ?? 0) !== current;
    });
  }, [
    data.catalog,
    data.holdings,
    data.numberedItems,
    quantityValues,
    selectedNumbered,
    selectedSoldier,
  ]);

  useEffect(() => {
    onDirtyChange(hasDraftChanges);
  }, [hasDraftChanges, onDirtyChange]);
  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange],
  );

  if (!selectedSoldier) {
    return (
      <section>
        <div className="page-heading">
          <div>
            <h1>החתמות</h1>
            <p>בחירת חייל ועריכת כל הציוד החתום עליו בפעולה אחת</p>
          </div>
        </div>
        <section className="panel soldier-picker">
          {pendingInitialItem && (
            <div className="selected-signing-item" role="status">
              <strong>ציוד שנבחר להחתמה</strong>
              <span>{pendingInitialItemLabel}</span>
              <small>לאחר בחירת חייל, הפריט יתווסף אוטומטית להחתמה.</small>
            </div>
          )}
          <Field label="חיפוש חייל">
            <input
              autoFocus
              placeholder="שם, מספר אישי, טלפון או מחלקה"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
          <div className="cards-list compact search-results">
            {soldierMatches.map(({ soldier }) => (
              <button
                type="button"
                className="soldier-result"
                key={soldier.personalNumber}
                onClick={() => setSelectedSoldier(soldier)}
              >
                <strong>{soldier.name}</strong>
                <span>
                  <bdi>{soldier.personalNumber}</bdi> · מחלקה {soldier.platoon}
                </span>
              </button>
            ))}
            {!soldierMatches.length && <EmptyList>לא נמצאו חיילים.</EmptyList>}
          </div>
        </section>
      </section>
    );
  }

  const currentNumbered = data.numberedItems.filter(
    (item) => item.active && item.assignedTo === selectedSoldier.personalNumber,
  );
  const selectedNumberedItems = data.numberedItems.filter((item) =>
    selectedNumbered.has(numberedItemKey(item.type, item.number)),
  );
  const availableNumbered = data.numberedItems.filter(
    (item) =>
      item.active &&
      item.status === "זמין" &&
      !item.assignedTo &&
      !selectedNumbered.has(numberedItemKey(item.type, item.number)),
  );
  const quantityCatalog = activeCatalogItemsForMethod(data.catalog, "כמותי");
  const activeGroups = data.equipmentGroups.filter((group) => group.active);
  const currentQuantity = (item: CatalogItem) =>
    data.holdings.find(
      (holding) =>
        holding.personalNumber === selectedSoldier.personalNumber &&
        catalogKey(holding.type, holding.variant) ===
          catalogKey(item.type, item.variant),
    )?.quantity || 0;
  const numberedToAssign = selectedNumberedItems.filter(
    (item) =>
      item.assignedTo !== selectedSoldier.personalNumber &&
      !(
        transferSeed?.kind === "numberedTransfer" &&
        numberedItemKey(item.type, item.number) ===
          numberedItemKey(transferSeed.item.type, transferSeed.item.number)
      ),
  );
  const numberedTransfers =
    transferSeed?.kind === "numberedTransfer" &&
    selectedNumbered.has(
      numberedItemKey(transferSeed.item.type, transferSeed.item.number),
    )
      ? [
          {
            item: transferSeed.item,
            from: transferSeed.from,
            note: transferSeed.note,
          },
        ]
      : [];
  const numberedToReturn = currentNumbered.filter(
    (item) => !selectedNumbered.has(numberedItemKey(item.type, item.number)),
  );
  const numberedHasDraftChange = (item: NumberedItem) => {
    const key = numberedItemKey(item.type, item.number);
    return (
      !selectedNumbered.has(key) ||
      item.assignedTo !== selectedSoldier.personalNumber
    );
  };
  const displayedNumberedItems = [
    ...selectedNumberedItems,
    ...numberedToReturn,
  ].filter((item) => !showOnlyChanged || numberedHasDraftChange(item));
  const quantityTransferKey =
    transferSeed?.kind === "quantityTransfer"
      ? catalogKey(transferSeed.item.type, transferSeed.item.variant)
      : "";
  const quantityTransferItem =
    transferSeed?.kind === "quantityTransfer"
      ? quantityCatalog.find(
          (item) => catalogKey(item.type, item.variant) === quantityTransferKey,
        )
      : undefined;
  const quantityTransferValue = quantityTransferItem
    ? Number(quantityValues[quantityTransferKey] ?? currentQuantity(quantityTransferItem))
    : 0;
  const quantityTransferAmount = quantityTransferItem
    ? quantityTransferValue - currentQuantity(quantityTransferItem)
    : 0;
  const quantityTransfers =
    transferSeed?.kind === "quantityTransfer" && quantityTransferItem &&
    Number.isInteger(quantityTransferAmount) && quantityTransferAmount > 0
      ? [{
          item: quantityTransferItem,
          from: transferSeed.from,
          quantity: quantityTransferAmount,
          note: transferSeed.note,
        }]
      : [];
  const quantityTargets = quantityCatalog
    .map((item) => ({
      item,
      quantity: Number(
        quantityValues[catalogKey(item.type, item.variant)] ?? 0,
      ),
    }))
    .filter(
      (target) =>
        catalogKey(target.item.type, target.item.variant) !==
          quantityTransferKey &&
        target.quantity !== currentQuantity(target.item),
    );
  const hasInvalidQuantityValue = quantityCatalog.some((item) => {
    const key = catalogKey(item.type, item.variant);
    if (!Object.hasOwn(quantityValues, key)) return false;
    const raw = quantityValues[key];
    const value = Number(raw);
    return (
      raw === "" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value >
        currentQuantity(item) +
          (key === quantityTransferKey &&
          transferSeed?.kind === "quantityTransfer"
            ? data.holdings.find(
                (holding) =>
                  holding.personalNumber === transferSeed.from.personalNumber &&
                  catalogKey(holding.type, holding.variant) === key,
              )?.quantity || 0
            : availableQuantity(item, data.holdings))
    );
  });
  const changeCount =
    numberedToAssign.length + numberedToReturn.length +
    numberedTransfers.length + quantityTargets.length + quantityTransfers.length;
  const displayedQuantityItems = quantityCatalog.filter(
    (item) => {
      const key = catalogKey(item.type, item.variant);
      const hasDraftValue = Object.hasOwn(quantityValues, key);
      const rawQuantity = quantityValues[key] ?? "";
      const changed =
        (!hasDraftValue && currentQuantity(item) > 0) ||
        (hasDraftValue &&
          (rawQuantity === "" || Number(rawQuantity) !== currentQuantity(item)));
      return (
        (hasDraftValue || currentQuantity(item) > 0) &&
        (!showOnlyChanged || changed)
      );
    },
  );
  const quantityAddItem = quantityCatalog.find(
    (item) => catalogKey(item.type, item.variant) === quantityToAdd,
  );
  const addQuantityNumber = Number(addQuantity);
  const hasValidAddQuantity =
    Number.isInteger(addQuantityNumber) && addQuantityNumber > 0;

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>החתמה — {selectedSoldier.name}</h1>
          <p>
            <bdi>{selectedSoldier.personalNumber}</bdi> · מחלקה{" "}
            {selectedSoldier.platoon}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          title="סגירת ההחתמה ובחירת חייל אחר"
          aria-label="סגירת ההחתמה ובחירת חייל אחר"
          onClick={() => {
            const replaceSoldier = () => {
              setSelectedSoldier(null);
              setQuery("");
            };
            if (hasDraftChanges) onRequestDiscard(replaceSoldier);
            else replaceSoldier();
          }}
        >
          ×
        </button>
      </div>

      <section className="panel">
        <div className="signing-list-heading">
          <h2>ציוד חתום</h2>
          <label className="changed-items-toggle">
            <input
              type="checkbox"
              checked={showOnlyChanged}
              onChange={(event) => setShowOnlyChanged(event.target.checked)}
            />
            <span>שינויים בלבד</span>
          </label>
        </div>
        {changeCount > 0 && (
          <p className="draft-change-legend">
            פריטים מסומנים כוללים שינויים שטרם נשמרו.
          </p>
        )}
        <div className="cards-list compact">
          {displayedNumberedItems.map((item) => {
            const key = numberedItemKey(item.type, item.number);
            const pendingRemoval = !selectedNumbered.has(key);
            const pendingAddition =
              !pendingRemoval &&
              item.assignedTo !== selectedSoldier.personalNumber;
            return (
              <article
                className={`list-card${
                  pendingRemoval
                    ? " draft-change draft-removal"
                    : pendingAddition
                      ? " draft-change draft-addition"
                      : ""
                }`}
                key={key}
              >
                <div>
                  <strong>
                    {itemLabel(item.type, item.variant)} · {item.number}
                  </strong>
                  <p>צל״מ</p>
                  {pendingRemoval && (
                    <span className="draft-change-badge removal">
                      ממתין להסרה
                    </span>
                  )}
                  {pendingAddition && (
                    <span className="draft-change-badge">טרם נשמר</span>
                  )}
                </div>
                {editable &&
                  (pendingRemoval ? (
                    <button
                      type="button"
                      className="small-button"
                      onClick={() =>
                        setSelectedNumbered(
                          (current) => new Set([...current, key]),
                        )
                      }
                    >
                      ביטול הסרה
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="small-button danger-text"
                      onClick={() => {
                        onRequestConfirmation({
                          title: "הסרת פריט מההחתמה",
                          message: `להסיר את ${itemLabel(item.type, item.variant)} מספר ${item.number} מטיוטת ההחתמה?`,
                          confirmLabel: "הסרה מההחתמה",
                          danger: true,
                          onConfirm: () => {
                            const next = new Set(selectedNumbered);
                            next.delete(key);
                            setSelectedNumbered(next);
                          },
                        });
                      }}
                    >
                      הסרה
                    </button>
                  ))}
              </article>
            );
          })}
          {displayedQuantityItems.map((item) => {
            const key = catalogKey(item.type, item.variant);
            const originalQuantity = currentQuantity(item);
            const hasDraftValue = Object.hasOwn(quantityValues, key);
            const rawQuantity = quantityValues[key] ?? "";
            const parsedQuantity = Number(rawQuantity);
            const invalidQuantity =
              hasDraftValue &&
              (rawQuantity === "" ||
                !Number.isInteger(parsedQuantity) ||
                parsedQuantity < 0);
            const pendingRemoval =
              originalQuantity > 0 &&
              (!hasDraftValue || (!invalidQuantity && parsedQuantity === 0));
            const changed =
              !hasDraftValue ||
              rawQuantity === "" ||
              parsedQuantity !== originalQuantity;
            return (
              <article
                className={`list-card${
                  changed
                    ? ` draft-change ${
                        pendingRemoval ? "draft-removal" : "draft-addition"
                      }`
                    : ""
                }`}
                key={key}
              >
                <div>
                  <strong>
                    {itemLabel(item.type, item.variant, item.variantLabel)}
                  </strong>
                  <p>כמותי</p>
                  {changed && (
                    <div className="quantity-change-summary">
                      <span
                        className={`draft-change-badge${
                          pendingRemoval ? " removal" : ""
                        }`}
                      >
                        {pendingRemoval
                          ? "ממתין להסרה"
                          : invalidQuantity
                            ? "שינוי לא תקין"
                            : "טרם נשמר"}
                      </span>
                      <small>כמות לפני השינוי: {originalQuantity}</small>
                    </div>
                  )}
                </div>
                {editable && (
                  <div className="quantity-editor">
                    {pendingRemoval ? (
                      <>
                        <span className="pending-removal-quantity">
                          כמות נוכחית: {originalQuantity}
                        </span>
                        <button
                          type="button"
                          className="small-button"
                          onClick={() =>
                            setQuantityValues((current) => ({
                              ...current,
                              [key]: String(originalQuantity),
                            }))
                          }
                        >
                          ביטול הסרה
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          aria-label={`כמות ${itemLabel(item.type, item.variant, item.variantLabel)}`}
                          type="number"
                          min="0"
                          max={
                            originalQuantity +
                            (key === quantityTransferKey &&
                            transferSeed?.kind === "quantityTransfer"
                              ? data.holdings.find(
                                  (holding) =>
                                    holding.personalNumber ===
                                      transferSeed.from.personalNumber &&
                                    catalogKey(holding.type, holding.variant) ===
                                      key,
                                )?.quantity || 0
                              : availableQuantity(item, data.holdings))
                          }
                          step="1"
                          value={rawQuantity}
                          onChange={(event) =>
                            setQuantityValues((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="small-button danger-text"
                          onClick={() =>
                            onRequestConfirmation({
                              title: "הסרת ציוד מההחתמה",
                              message: `להסיר את ${itemLabel(item.type, item.variant, item.variantLabel)} מטיוטת ההחתמה?`,
                              confirmLabel: "הסרה מההחתמה",
                              danger: true,
                              onConfirm: () =>
                                setQuantityValues((current) => {
                                  const next = { ...current };
                                  delete next[key];
                                  return next;
                                }),
                            })
                          }
                        >
                          הסרה
                        </button>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!displayedNumberedItems.length && !displayedQuantityItems.length && (
            <EmptyList>
              {showOnlyChanged
                ? "אין שינויים ממתינים לשמירה."
                : "אין ציוד חתום לחייל."}
            </EmptyList>
          )}
        </div>
      </section>

      {editable && (
        <section className="panel signing-add-panel">
          <h2>הוספת ציוד להחתמה</h2>
          {activeGroups.length > 0 && (
            <div className="signing-group-add">
              <Field label="ערכת ציוד">
                <select
                  value={groupToAdd}
                  onChange={(event) => setGroupToAdd(event.target.value)}
                >
                  <option value="">בחירה</option>
                  {activeGroups.map((group) => (
                    <option key={group.name} value={group.name}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </Field>
              {groupToAdd && (
                <div className="group-component-summary">
                  {data.equipmentGroupItems
                    .filter(
                      (component) =>
                        component.active && component.groupName === groupToAdd,
                    )
                    .map((component) => {
                      const item = quantityCatalog.find(
                        (candidate) =>
                          catalogKey(candidate.type, candidate.variant) ===
                          catalogKey(component.type, component.variant),
                      );
                      return (
                        <span
                          key={catalogKey(component.type, component.variant)}
                        >
                          {itemLabel(
                            component.type,
                            component.variant,
                            item?.variantLabel,
                          )} {component.quantity} יח׳
                        </span>
                      );
                    })}
                </div>
              )}
              <button
                type="button"
                className="secondary-button"
                disabled={!groupToAdd}
                onClick={() => {
                  const components = data.equipmentGroupItems.filter(
                    (component) =>
                      component.active && component.groupName === groupToAdd,
                  );
                  const additions = components.flatMap((component) => {
                    const item = quantityCatalog.find(
                      (candidate) =>
                        catalogKey(candidate.type, candidate.variant) ===
                        catalogKey(component.type, component.variant),
                    );
                    if (!item) return [];
                    const key = catalogKey(item.type, item.variant);
                    const currentTarget = Number(
                      quantityValues[key] ?? currentQuantity(item),
                    );
                    const next = currentTarget + component.quantity;
                    const maximum =
                      currentQuantity(item) +
                      availableQuantity(item, data.holdings);
                    return [{ item, key, next, maximum }];
                  });
                  const shortages = additions.filter(
                    (addition) => addition.next > addition.maximum,
                  );
                  if (shortages.length || additions.length !== components.length) {
                    const details = shortages
                      .map(
                        ({ item, next, maximum }) =>
                          `${itemLabel(item.type, item.variant, item.variantLabel)} — חסרות ${next - maximum} יח׳`,
                      )
                      .join(", ");
                    onError(
                      details
                        ? `לא ניתן להוסיף את הערכה. ${details}`
                        : "לא ניתן להוסיף את הערכה כי אחד מפריטיה אינו זמין.",
                    );
                    return;
                  }
                  setQuantityValues((current) => {
                    const next = { ...current };
                    additions.forEach((addition) => {
                      next[addition.key] = String(addition.next);
                    });
                    return next;
                  });
                  setGroupToAdd("");
                }}
              >
                הוספת ערכה להחתמה
              </button>
            </div>
          )}
          <div className="signing-add-grid">
            <div>
              <Field label="פריט צל״מ זמין">
                <select
                  value={numberedToAdd}
                  onChange={(event) => setNumberedToAdd(event.target.value)}
                >
                  <option value="">בחירה</option>
                  {availableNumbered.map((item) => {
                    const key = numberedItemKey(item.type, item.number);
                    return (
                      <option key={key} value={key}>
                        {itemLabel(item.type, item.variant)} · {item.number}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <button
                type="button"
                className="secondary-button"
                disabled={!numberedToAdd}
                onClick={() => {
                  setSelectedNumbered(
                    (current) => new Set([...current, numberedToAdd]),
                  );
                  setNumberedToAdd("");
                }}
              >
                הוספה להחתמה
              </button>
            </div>
            <div>
              <Field label="ציוד כמותי">
                <select
                  value={quantityToAdd}
                  onChange={(event) => setQuantityToAdd(event.target.value)}
                >
                  <option value="">בחירה</option>
                  {quantityCatalog.map((item) => {
                    const key = catalogKey(item.type, item.variant);
                    return (
                      <option key={key} value={key}>
                        {itemLabel(item.type, item.variant, item.variantLabel)}{" "}
                        · זמין {availableQuantity(item, data.holdings)}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label="כמות להוספה">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={addQuantity}
                  onChange={(event) => setAddQuantity(event.target.value)}
                />
              </Field>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  !quantityAddItem ||
                  !hasValidAddQuantity ||
                  availableQuantity(quantityAddItem, data.holdings) <= 0
                }
                onClick={() => {
                  if (!quantityAddItem) return;
                  const maximum =
                    currentQuantity(quantityAddItem) +
                    availableQuantity(quantityAddItem, data.holdings);
                  setQuantityValues((current) => ({
                    ...current,
                    [quantityToAdd]: String(
                      Math.min(
                        maximum,
                        Number(current[quantityToAdd] || 0) +
                          addQuantityNumber,
                      ),
                    ),
                  }));
                  setQuantityToAdd("");
                  setAddQuantity("1");
                }}
              >
                הוספה להחתמה
              </button>
            </div>
          </div>
        </section>
      )}

      {editable && (canAddCatalogType || canAddNumberedItem) && (
        <section className="panel signing-inventory-panel">
          <h2>הוספת ציוד חדש למלאי</h2>
          <p>לאחר השמירה הרשימות בהחתמה יתעדכנו בלי לאבד את הטיוטה הנוכחית.</p>
          <div className="quick-actions">
            {canAddCatalogType && (
              <button
                type="button"
                className={
                  canAddNumberedItem ? "secondary-button" : "primary-button"
                }
                onClick={onAddCatalogType}
              >
                סוג ציוד חדש
              </button>
            )}
            {canAddNumberedItem && (
              <button
                type="button"
                className="primary-button"
                onClick={onAddNumberedItem}
              >
                פריט צל״מ חדש
              </button>
            )}
          </div>
        </section>
      )}

      <div className="signing-save-bar">
        <span>
          {changeCount
            ? `${changeCount} שינויים ממתינים`
            : "אין שינויים לשמירה"}
        </span>
        <button
          className="primary-button"
          disabled={
            !editable || saving || !changeCount || hasInvalidQuantityValue
          }
          onClick={() =>
            setPendingSigning({
              numberedToAssign,
              numberedToReturn,
              numberedTransfers,
              quantityTargets,
              quantityTransfers,
            })
          }
        >
          שמירת ההחתמה
        </button>
      </div>
      {hasInvalidQuantityValue && (
        <p className="form-error" role="alert">
          יש להזין כמות תקינה לפני שמירת ההחתמה.
        </p>
      )}
      {pendingSigning && (
        <SignatureModal
          soldier={selectedSoldier}
          changeCount={changeCount}
          saving={saving}
          onClose={() => setPendingSigning(null)}
          onConfirm={async (signature) => {
            const saved = await onSave(selectedSoldier, {
              ...pendingSigning,
              signature,
            });
            if (saved) {
              setPendingSigning(null);
              setTransferSeed(null);
            }
          }}
        />
      )}
    </section>
  );
}
