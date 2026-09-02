import { describe, expect, it } from "vitest";
import {
  activeCatalogItemsForMethod,
  availableQuantity,
  canRemoveCatalogItem,
  canRemoveSoldier,
  catalogActualQuantity,
  catalogStandardGap,
  fuzzyScore,
  soldiersWithoutEquipment,
  validateCatalogInput,
  validateNumberedIdentity,
  validateSoldierInput,
  validateStatusChange,
} from "./rules";
import {
  additiveSchemaUpgrade,
  isWorkbookEmpty,
  SHEET_SCHEMAS,
  validateHeaders,
} from "./schema";
import type { CatalogItem, NumberedItem, SpreadsheetMeta } from "./types";

const sheets = Object.values(SHEET_SCHEMAS).map((schema, index) => ({
  id: index,
  title: schema.title,
  rowCount: 100,
  columnCount: 20,
}));
const meta = {
  spreadsheetId: "x",
  title: "x",
  editable: true,
  userEmail: "",
  userName: "",
  sheets,
} satisfies SpreadsheetMeta;
const numbered: NumberedItem = {
  row: 2,
  type: "נשק",
  variant: "",
  number: "123",
  status: "משויך",
  assignedTo: "1",
  location: "",
  note: "",
  active: true,
};
const quantity: CatalogItem = {
  row: 2,
  type: "חולצה",
  variant: "M",
  variantLabel: "מידה",
  method: "כמותי",
  totalStock: 10,
  location: "",
  note: "",
  active: true,
};

describe("spreadsheet compatibility", () => {
  it("distinguishes a truly empty workbook", () => {
    expect(
      isWorkbookEmpty(
        meta,
        Object.fromEntries(sheets.map((sheet) => [sheet.title, []])),
      ),
    ).toBe(true);
    expect(
      isWorkbookEmpty(meta, {
        ...Object.fromEntries(sheets.map((sheet) => [sheet.title, []])),
        חיילים: [["data"]],
      }),
    ).toBe(false);
  });

  it("reports every missing required tab", () => {
    const partialMeta = {
      ...meta,
      sheets: sheets.filter((sheet) => sheet.title === "חיילים"),
    };
    expect(
      validateHeaders(partialMeta, {
        חיילים: [[...SHEET_SCHEMAS.soldiers.headers]],
      }),
    ).toHaveLength(7);
  });

  it("offers an additive upgrade for a missing tab or trailing column", () => {
    const withoutSignatures = {
      ...meta,
      sheets: sheets.filter((sheet) => sheet.title !== "חתימות"),
    };
    const values = Object.fromEntries(
      Object.values(SHEET_SCHEMAS)
        .filter((schema) => schema.title !== "חתימות")
        .map((schema) => [schema.title, [[...schema.headers]]]),
    );
    values["חיילים"] = [["שם", "מספר אישי", "מחלקה", "פעיל"]];
    values["קטלוג"] = [[
      "סוג",
      "ערך מאפיין",
      "שם מאפיין",
      "שיטת ניהול",
      "מלאי כולל",
      "הערה",
      "פעיל",
      "מיקום",
    ]];
    values["פריטי צל״מ"] = [[
      "סוג",
      "ערך מאפיין",
      "מספר מזהה",
      "סטטוס",
      "מספר אישי משויך",
      "הערה",
      "פעיל",
    ]];
    const upgrade = additiveSchemaUpgrade(withoutSignatures, values);
    expect(upgrade?.missingSheets).toEqual(["חתימות"]);
    expect(upgrade?.missingColumns).toEqual([
      { sheetTitle: "חיילים", startColumn: 4, headers: ["טלפון"] },
      {
        sheetTitle: "קטלוג",
        startColumn: 8,
        headers: ["תקן"],
      },
      { sheetTitle: "פריטי צל״מ", startColumn: 7, headers: ["מיקום"] },
    ]);
  });

  it("treats the former four-tab sheet as incompatible", () => {
    const oldMeta = {
      ...meta,
      sheets: [
        { id: 1, title: "חיילים", rowCount: 10, columnCount: 4 },
        { id: 2, title: "צלם", rowCount: 10, columnCount: 6 },
        { id: 3, title: "שיוכים", rowCount: 10, columnCount: 8 },
        { id: 4, title: "הגדרות", rowCount: 10, columnCount: 2 },
      ],
    };
    const issues = validateHeaders(oldMeta, {
      חיילים: [["שם", "מספר אישי", "מחלקה", "פעיל"]],
      צלם: [["סוג"]],
      שיוכים: [["חותמת זמן"]],
      הגדרות: [["סוגי צלם", "מחלקות"]],
    });
    expect(issues).toContain("חסרה לשונית: קטלוג");
    expect(issues).toContain("כותרות לא תקינות בלשונית: הגדרות");
    expect(additiveSchemaUpgrade(oldMeta, {
      חיילים: [["שם", "מספר אישי", "מחלקה", "פעיל"]],
      צלם: [["סוג"]],
      שיוכים: [["חותמת זמן"]],
      הגדרות: [["סוגי צלם", "מחלקות"]],
    })).toBeNull();
  });
});

describe("domain invariants", () => {
  it("supports fuzzy soldier search while preferring direct matches", () => {
    expect(fuzzyScore("משה כהן 123456", "משה")).toBeGreaterThan(
      fuzzyScore("משה כהן 123456", "מכה"),
    );
    expect(fuzzyScore("משה כהן 123456", "מכה")).toBeGreaterThan(0);
    expect(fuzzyScore("משה כהן 123456", "דוד")).toBe(0);
  });

  it("allows an empty phone and validates a supplied phone", () => {
    expect(
      validateSoldierInput(
        { name: "א", personalNumber: "1", platoon: "א", phone: "" },
        [],
      ),
    ).toHaveLength(0);
    expect(
      validateSoldierInput(
        { name: "א", personalNumber: "1", platoon: "א", phone: "123" },
        [],
      ),
    ).toContain("מספר הטלפון אינו תקין.");
  });

  it("allows only digits in a soldier personal number", () => {
    expect(
      validateSoldierInput(
        { name: "א", personalNumber: "12A-3", platoon: "א", phone: "" },
        [],
      ),
    ).toContain("מספר אישי יכול להכיל ספרות בלבד.");
    expect(
      validateSoldierInput(
        { name: "א", personalNumber: "00123", platoon: "א", phone: "" },
        [],
      ),
    ).toHaveLength(0);
  });

  it("rejects a personal number that already belongs to another soldier", () => {
    const existingSoldier = {
      row: 2,
      name: "חייל קיים",
      personalNumber: "00123",
      platoon: "א",
      active: true,
      phone: "",
    };
    expect(
      validateSoldierInput(
        {
          name: "חייל חדש",
          personalNumber: existingSoldier.personalNumber,
          platoon: "א",
          phone: "",
        },
        [existingSoldier],
      ),
    ).toContain("כבר קיים חייל עם המספר האישי הזה.");
  });

  it("requires an explanation for exceptional numbered statuses", () => {
    expect(validateStatusChange("תקול", "")).toContain(
      "חובה להוסיף הערה לסטטוס שנבחר.",
    );
    expect(validateStatusChange("זמין", "")).toHaveLength(0);
  });

  it("enforces numbered uniqueness within type", () => {
    expect(validateNumberedIdentity("נשק", "123", [numbered])).toContain(
      "המספר המזהה כבר קיים בסוג הציוד הזה.",
    );
    expect(validateNumberedIdentity("משקפת", "123", [numbered])).toHaveLength(
      0,
    );
  });

  it("allows an empty variant and rejects a duplicate type/variant pair", () => {
    const input = {
      type: "תחבושת אישית",
      variant: "",
      variantLabel: "",
      method: "כמותי" as const,
      totalStock: 20,
      location: "",
      note: "",
    };
    expect(validateCatalogInput(input, [])).toHaveLength(0);
    expect(
      validateCatalogInput({ ...input, standard: -1 }, []),
    ).toContain("התקן חייב להיות מספר שלם שאינו שלילי.");
    expect(validateCatalogInput({ ...input, variant: "M" }, [])).toContain(
      "יש למלא גם שם מאפיין וגם ערך מאפיין, או להשאיר את שניהם ריקים.",
    );
    expect(
      validateCatalogInput(input, [
        { ...quantity, type: input.type, variant: "" },
      ]),
    ).toContain("השילוב של סוג וערך מאפיין כבר קיים בקטלוג.");
  });

  it("calculates standard gaps for quantity and numbered equipment", () => {
    expect(catalogStandardGap({ ...quantity, standard: 12 }, [])).toBe(2);
    const numberedCatalog = {
      ...quantity,
      method: "צל״מ" as const,
      type: "נשק",
      variant: "",
      standard: 2,
    };
    expect(catalogActualQuantity(numberedCatalog, [numbered])).toBe(1);
    expect(catalogStandardGap(numberedCatalog, [numbered])).toBe(1);
    expect(
      catalogStandardGap({ ...numberedCatalog, standard: null }, []),
    ).toBeNull();
  });

  it("returns only active catalog items for the requested management method", () => {
    const numberedCatalog = { ...quantity, row: 3, type: "נשק", method: "צל״מ" as const };
    const inactiveNumbered = { ...numberedCatalog, row: 4, type: "קסדה", active: false };
    const missingType = { ...numberedCatalog, row: 5, type: "", variant: "M4" };

    expect(
      activeCatalogItemsForMethod(
        [quantity, numberedCatalog, inactiveNumbered, missingType],
        "צל״מ",
      ).map((item) => item.type),
    ).toEqual(["נשק"]);
  });

  it("calculates quantity availability and blocks removal while held", () => {
    const holdings = [
      { row: 2, personalNumber: "1", type: "חולצה", variant: "M", quantity: 3 },
    ];
    expect(availableQuantity(quantity, holdings)).toBe(7);
    expect(canRemoveCatalogItem(quantity, [], holdings)).toContain(
      "החזקות פעילות",
    );
  });

  it("counts soldiers with neither numbered nor quantity equipment", () => {
    const soldiers = [
      {
        row: 2,
        name: "א",
        personalNumber: "1",
        platoon: "1",
        active: true,
        phone: "",
      },
      {
        row: 3,
        name: "ב",
        personalNumber: "2",
        platoon: "1",
        active: true,
        phone: "",
      },
    ];
    const holdings = [
      { row: 2, personalNumber: "2", type: "חולצה", variant: "M", quantity: 1 },
    ];
    expect(
      soldiersWithoutEquipment(soldiers, [numbered], holdings),
    ).toHaveLength(0);
    expect(canRemoveSoldier(soldiers[0], [numbered], holdings)).toContain(
      "מחזיק ציוד",
    );
  });
});
