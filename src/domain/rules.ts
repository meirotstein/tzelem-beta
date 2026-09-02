import {
  catalogKey,
  holdingKey,
  numberedItemKey,
  normalizeText,
} from "./schema";
import type {
  CatalogInput,
  CatalogItem,
  ManagementMethod,
  NumberedItem,
  QuantityHolding,
  Soldier,
  SoldierInput,
} from "./types";

export const activeCatalogItemsForMethod = (
  catalog: CatalogItem[],
  method: ManagementMethod,
): CatalogItem[] =>
  catalog.filter(
    (item) =>
      item.active && item.method === method && Boolean(normalizeText(item.type)),
  );

export const validateSoldierInput = (
  input: SoldierInput,
  soldiers: Soldier[],
  originalPersonalNumber?: string,
): string[] => {
  const errors: string[] = [];
  const personalNumber = normalizeText(input.personalNumber);
  if (!normalizeText(input.name)) errors.push("יש להזין שם חייל.");
  if (!personalNumber) errors.push("יש להזין מספר אישי.");
  else if (!/^\d+$/.test(personalNumber))
    errors.push("מספר אישי יכול להכיל ספרות בלבד.");
  if (!normalizeText(input.platoon)) errors.push("יש לבחור מחלקה.");
  if (normalizeText(input.phone)) {
    const digits = normalizeText(input.phone).replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15)
      errors.push("מספר הטלפון אינו תקין.");
  }
  if (
    soldiers.some(
      (soldier) =>
        soldier.personalNumber === personalNumber &&
        soldier.personalNumber !== originalPersonalNumber,
    )
  ) {
    errors.push("כבר קיים חייל עם המספר האישי הזה.");
  }
  return errors;
};

export function fuzzyScore(value: string, query: string): number {
  const normalizedValue = value.toLocaleLowerCase("he").replace(/\s+/g, " ");
  const normalizedQuery = query.toLocaleLowerCase("he").trim();
  if (!normalizedQuery) return 1;
  const directIndex = normalizedValue.indexOf(normalizedQuery);
  if (directIndex >= 0) return 100 - directIndex;
  let queryIndex = 0;
  let gaps = 0;
  for (
    let index = 0;
    index < normalizedValue.length && queryIndex < normalizedQuery.length;
    index += 1
  ) {
    if (normalizedValue[index] === normalizedQuery[queryIndex]) queryIndex += 1;
    else if (queryIndex > 0) gaps += 1;
  }
  return queryIndex === normalizedQuery.length ? Math.max(1, 50 - gaps) : 0;
}

export const validateCatalogInput = (
  input: CatalogInput,
  catalog: CatalogItem[],
  original?: CatalogItem,
): string[] => {
  const errors: string[] = [];
  if (!normalizeText(input.type)) errors.push("יש להזין סוג ציוד.");
  if (
    Boolean(normalizeText(input.variant)) !==
    Boolean(normalizeText(input.variantLabel))
  )
    errors.push(
      "יש למלא גם שם מאפיין וגם ערך מאפיין, או להשאיר את שניהם ריקים.",
    );
  if (!Number.isInteger(input.totalStock) || input.totalStock < 0)
    errors.push("המלאי הכולל חייב להיות מספר שלם שאינו שלילי.");
  const key = catalogKey(input.type, input.variant);
  if (
    catalog.some(
      (item) =>
        catalogKey(item.type, item.variant) === key &&
        item.row !== original?.row,
    )
  ) {
    errors.push("השילוב של סוג וערך מאפיין כבר קיים בקטלוג.");
  }
  return errors;
};

export const validateNumberedIdentity = (
  type: string,
  number: string,
  items: NumberedItem[],
  original?: NumberedItem,
): string[] => {
  const errors: string[] = [];
  if (!normalizeText(type)) errors.push("יש לבחור סוג ציוד.");
  if (!normalizeText(number)) errors.push("יש להזין מספר מזהה.");
  const key = numberedItemKey(type, number);
  if (
    items.some(
      (item) =>
        numberedItemKey(item.type, item.number) === key &&
        item.row !== original?.row,
    )
  ) {
    errors.push("המספר המזהה כבר קיים בסוג הציוד הזה.");
  }
  return errors;
};

export const validateStatusChange = (status: string, note: string): string[] =>
  ["אבוד", "תקול", "מושבת"].includes(status) && !normalizeText(note)
    ? ["חובה להוסיף הערה לסטטוס שנבחר."]
    : [];

export const issuedQuantity = (
  item: CatalogItem,
  holdings: QuantityHolding[],
): number =>
  holdings
    .filter(
      (holding) =>
        catalogKey(holding.type, holding.variant) ===
        catalogKey(item.type, item.variant),
    )
    .reduce((sum, holding) => sum + holding.quantity, 0);

export const availableQuantity = (
  item: CatalogItem,
  holdings: QuantityHolding[],
): number => Math.max(0, item.totalStock - issuedQuantity(item, holdings));

export const holdingFor = (
  holdings: QuantityHolding[],
  personalNumber: string,
  type: string,
  variant = "",
): QuantityHolding | undefined =>
  holdings.find(
    (holding) =>
      holdingKey(holding.personalNumber, holding.type, holding.variant) ===
      holdingKey(personalNumber, type, variant),
  );

export const numberedItemsForSoldier = (
  items: NumberedItem[],
  personalNumber: string,
): NumberedItem[] =>
  items.filter((item) => item.active && item.assignedTo === personalNumber);

export const holdingsForSoldier = (
  holdings: QuantityHolding[],
  personalNumber: string,
): QuantityHolding[] =>
  holdings.filter(
    (holding) =>
      holding.personalNumber === personalNumber && holding.quantity > 0,
  );

export const soldierHasEquipment = (
  soldier: Soldier,
  items: NumberedItem[],
  holdings: QuantityHolding[],
): boolean =>
  numberedItemsForSoldier(items, soldier.personalNumber).length > 0 ||
  holdingsForSoldier(holdings, soldier.personalNumber).length > 0;

export const canRemoveSoldier = (
  soldier: Soldier,
  items: NumberedItem[],
  holdings: QuantityHolding[],
): string | null =>
  soldierHasEquipment(soldier, items, holdings)
    ? "לא ניתן להסיר חייל שמחזיק ציוד. יש להחזיר או להעביר את הציוד תחילה."
    : null;

export const canRemoveNumberedItem = (item: NumberedItem): string | null =>
  item.assignedTo
    ? "לא ניתן להסיר פריט משויך. יש להחזיר או להעביר אותו תחילה."
    : null;

export const canRemoveCatalogItem = (
  item: CatalogItem,
  numberedItems: NumberedItem[],
  holdings: QuantityHolding[],
): string | null => {
  if (
    item.method === "צל״מ" &&
    numberedItems.some(
      (numbered) =>
        numbered.active &&
        catalogKey(numbered.type, numbered.variant) ===
          catalogKey(item.type, item.variant),
    )
  ) {
    return "לא ניתן להסיר סוג ציוד כל עוד קיימים בו פריטים פעילים.";
  }
  if (item.method === "כמותי" && issuedQuantity(item, holdings) > 0)
    return "לא ניתן להסיר סוג ציוד כל עוד קיימות החזקות פעילות.";
  return null;
};

export const soldiersWithoutEquipment = (
  soldiers: Soldier[],
  items: NumberedItem[],
  holdings: QuantityHolding[],
): Soldier[] =>
  soldiers.filter(
    (soldier) =>
      soldier.active && !soldierHasEquipment(soldier, items, holdings),
  );
