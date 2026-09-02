import type {
  AdditiveSchemaUpgrade,
  EquipmentStatus,
  EquipmentScope,
  ManagementMethod,
  SpreadsheetMeta,
} from "./types";

export const SCHEMA_VERSION = "8";

export const SHEET_SCHEMAS = {
  soldiers: {
    title: "חיילים",
    headers: ["שם", "מספר אישי", "מחלקה", "פעיל", "טלפון"],
  },
  catalog: {
    title: "קטלוג",
    headers: [
      "סוג",
      "ערך מאפיין",
      "שם מאפיין",
      "שיטת ניהול",
      "מלאי כולל",
      "הערה",
      "פעיל",
      "מיקום",
      "תקן",
    ],
  },
  numberedItems: {
    title: "פריטי צל״מ",
    headers: [
      "סוג",
      "ערך מאפיין",
      "מספר מזהה",
      "סטטוס",
      "מספר אישי משויך",
      "הערה",
      "פעיל",
      "מיקום",
    ],
  },
  holdings: {
    title: "החזקות כמותיות",
    headers: ["מספר אישי", "סוג", "ערך מאפיין", "כמות"],
  },
  equipmentGroups: {
    title: "ערכות",
    headers: ["שם ערכה", "הערה", "פעיל"],
  },
  equipmentGroupItems: {
    title: "פריטי ערכה",
    headers: ["שם ערכה", "סוג", "ערך מאפיין", "כמות", "פעיל"],
  },
  movements: {
    title: "תנועות",
    headers: [
      "חותמת זמן",
      "פעולה",
      "שיטת ניהול",
      "סוג",
      "ערך מאפיין",
      "מספר מזהה",
      "כמות",
      "מספר אישי קודם",
      "מספר אישי חדש",
      "מבצע הפעולה",
      "הערה",
    ],
  },
  signatures: {
    title: "חתימות",
    headers: [
      "חותמת זמן",
      "מספר אישי",
      "שם חייל",
      "מבצע הפעולה",
      "פרטי ההחתמה",
      "נתוני חתימה",
      "גרסת פורמט",
    ],
  },
  permissions: {
    title: "הרשאות",
    headers: ["אימייל", "מנהל", "היקף ציוד", "מחלקות"],
  },
  settings: { title: "הגדרות", headers: ["מחלקות", "מפתח", "ערך"] },
} as const;

export const normalizeText = (value: unknown): string =>
  String(value ?? "").trim();

export const parseActive = (value: unknown): boolean => {
  const normalized = normalizeText(value).toLowerCase();
  return !["false", "0", "לא", "לא פעיל"].includes(normalized);
};

export const asNonNegativeInteger = (value: unknown): number => {
  const parsed = Number(normalizeText(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

export const catalogKey = (type: string, variant = ""): string =>
  `${normalizeText(type)}\u0000${normalizeText(variant)}`;
export const numberedItemKey = (type: string, number: string): string =>
  `${normalizeText(type)}\u0000${normalizeText(number)}`;
export const holdingKey = (
  personalNumber: string,
  type: string,
  variant = "",
): string =>
  `${normalizeText(personalNumber)}\u0000${catalogKey(type, variant)}`;

export const itemLabel = (
  type: string,
  variant = "",
  variantLabel = "",
): string => {
  const cleanVariant = normalizeText(variant);
  if (!cleanVariant) return normalizeText(type);
  const prefix = normalizeText(variantLabel);
  return `${normalizeText(type)} · ${prefix ? `${prefix} ` : ""}${cleanVariant}`;
};

export const isEquipmentStatus = (value: string): value is EquipmentStatus =>
  ["זמין", "משויך", "תקול", "אבוד", "בתיקון", "מושבת"].includes(value);

export const isManagementMethod = (value: string): value is ManagementMethod =>
  value === "צל״מ" || value === "כמותי";

export const isEquipmentScope = (value: string): value is EquipmentScope =>
  value === "צל״מ" || value === "כמותי" || value === "הכל";

export const parseYes = (value: unknown): boolean =>
  ["true", "1", "כן"].includes(normalizeText(value).toLowerCase());

export const headersMatch = (
  actual: unknown[],
  expected: readonly string[],
): boolean =>
  expected.every((header, index) => normalizeText(actual[index]) === header);

export const isWorkbookEmpty = (
  meta: SpreadsheetMeta,
  values: Record<string, unknown[][]>,
): boolean =>
  meta.sheets.every((sheet) =>
    (values[sheet.title] ?? []).every((row) =>
      row.every((cell) => !normalizeText(cell)),
    ),
  );

export const validateHeaders = (
  meta: SpreadsheetMeta,
  values: Record<string, unknown[][]>,
): string[] => {
  const issues: string[] = [];
  Object.values(SHEET_SCHEMAS).forEach((schema) => {
    if (!meta.sheets.some((sheet) => sheet.title === schema.title)) {
      issues.push(`חסרה לשונית: ${schema.title}`);
      return;
    }
    if (!headersMatch(values[schema.title]?.[0] ?? [], schema.headers)) {
      issues.push(`כותרות לא תקינות בלשונית: ${schema.title}`);
    }
  });
  return issues;
};

export const additiveSchemaUpgrade = (
  meta: SpreadsheetMeta,
  values: Record<string, unknown[][]>,
): AdditiveSchemaUpgrade | null => {
  const missingSheets: string[] = [];
  const missingColumns: AdditiveSchemaUpgrade["missingColumns"] = [];

  for (const schema of Object.values(SHEET_SCHEMAS)) {
    if (!meta.sheets.some((sheet) => sheet.title === schema.title)) {
      missingSheets.push(schema.title);
      continue;
    }
    const sheetRows = values[schema.title] ?? [];
    const rawHeader = sheetRows[0] ?? [];
    let headerLength = rawHeader.length;
    while (headerLength > 0 && !normalizeText(rawHeader[headerLength - 1]))
      headerLength -= 1;
    const actualHeaders = rawHeader
      .slice(0, headerLength)
      .map((header) => normalizeText(header));
    if (!actualHeaders.length) {
      const hasData = sheetRows.some((row) =>
        row.some((value) => Boolean(normalizeText(value))),
      );
      if (hasData) return null;
    }
    const comparedLength = Math.min(
      actualHeaders.length,
      schema.headers.length,
    );
    const matchingPrefix = Array.from(
      { length: comparedLength },
      (_, index) => actualHeaders[index] === schema.headers[index],
    ).every(Boolean);
    if (!matchingPrefix) return null;
    if (actualHeaders.length < schema.headers.length) {
      missingColumns.push({
        sheetTitle: schema.title,
        startColumn: actualHeaders.length,
        headers: [...schema.headers.slice(actualHeaders.length)],
      });
    }
  }

  if (!missingSheets.length && !missingColumns.length) return null;
  const settingsRows = values[SHEET_SCHEMAS.settings.title] ?? [];
  const existingVersionIndex = settingsRows.findIndex(
    (row) => normalizeText(row[1]) === "schema_version",
  );
  return {
    missingSheets,
    missingColumns,
    settingsVersionRow:
      existingVersionIndex >= 0
        ? existingVersionIndex + 1
        : Math.max(2, settingsRows.length + 1),
  };
};

export const describeAdditiveUpgrade = (
  upgrade: AdditiveSchemaUpgrade,
): string[] => [
  ...upgrade.missingSheets.map((title) => `תתווסף לשונית: ${title}`),
  ...upgrade.missingColumns.map(
    ({ sheetTitle, headers }) =>
      `יתווספו עמודות בסוף ${sheetTitle}: ${headers.join(", ")}`,
  ),
];
