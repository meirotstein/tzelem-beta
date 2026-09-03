import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHEET_SCHEMAS } from "../domain/schema";
import type { CompanyData, SignatureData, Soldier } from "../domain/types";
import { SpreadsheetRepository } from "./spreadsheetRepository";

const signature: SignatureData = {
  version: 1,
  strokes: [
    [
      [0.1, 0.2, 0],
      [0.12, 0.25, 10],
      [0.16, 0.3, 20],
      [0.21, 0.35, 30],
      [0.27, 0.32, 40],
      [0.33, 0.28, 50],
      [0.4, 0.3, 60],
      [0.48, 0.36, 70],
    ],
  ],
};

const soldier: Soldier = {
  row: 2,
  name: "ישראל ישראלי",
  personalNumber: "1234567",
  platoon: "1",
  active: true,
  phone: "",
};

const data: CompanyData = {
  meta: {
    spreadsheetId: "sheet",
    title: "sheet",
    editable: true,
    userEmail: "admin@example.com",
    userName: "Admin",
    sheets: Object.values(SHEET_SCHEMAS).map((schema, id) => ({
      id,
      title: schema.title,
      rowCount: 100,
      columnCount: 20,
    })),
  },
  soldiers: [soldier],
  catalog: [],
  numberedItems: [
    {
      row: 2,
      type: "נשק",
      variant: "",
      number: "123",
      status: "זמין",
      assignedTo: "",
      location: "",
      note: "",
      active: true,
    },
  ],
  holdings: [],
  equipmentGroups: [],
  equipmentGroupItems: [],
  movements: [],
  signatures: [],
  permissions: [],
  settings: { platoons: ["1"], locations: [], schemaVersion: "8" },
};

describe("saveSigningSession", () => {
  const batchUpdate = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    batchUpdate.mockClear();
    (globalThis as typeof globalThis & { gapi: unknown }).gapi = {
      client: { sheets: { spreadsheets: { batchUpdate } } },
    };
  });

  it("writes current state, movement, snapshot, and signature in one batch", async () => {
    const repository = new SpreadsheetRepository("sheet");
    await repository.saveSigningSession(data, soldier, {
      numberedToAssign: [data.numberedItems[0]],
      numberedToReturn: [],
      quantityTargets: [],
      signature,
    });

    expect(batchUpdate).toHaveBeenCalledTimes(1);
    const call = batchUpdate.mock.calls[0][0];
    const requests = call.resource.requests;
    expect(requests).toHaveLength(3);
    expect(requests[0].updateCells).toBeTruthy();
    expect(requests[1].appendCells.sheetId).toBe(
      data.meta.sheets.find(
        (sheet) => sheet.title === SHEET_SCHEMAS.movements.title,
      )?.id,
    );
    expect(requests[2].appendCells.sheetId).toBe(
      data.meta.sheets.find(
        (sheet) => sheet.title === SHEET_SCHEMAS.signatures.title,
      )?.id,
    );
    const signatureValues = requests[2].appendCells.rows[0].values.map(
      (value: { userEnteredValue: { stringValue?: string } }) =>
        value.userEnteredValue.stringValue,
    );
    expect(JSON.parse(signatureValues[4]).changes).toMatchObject([
      { action: "החתמה", type: "נשק", number: "123", quantity: 1 },
    ]);
    expect(JSON.parse(signatureValues[5])).toEqual(signature);
  });

  it("rejects an empty signature before writing", async () => {
    const repository = new SpreadsheetRepository("sheet");
    await expect(
      repository.saveSigningSession(data, soldier, {
        numberedToAssign: [data.numberedItems[0]],
        numberedToReturn: [],
        quantityTargets: [],
        signature: { version: 1, strokes: [] },
      }),
    ).rejects.toThrow("חתימה תקינה");
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});

describe("applyAdditiveSchemaUpgrade", () => {
  const batchUpdate = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    batchUpdate.mockClear();
    (globalThis as typeof globalThis & { gapi: unknown }).gapi = {
      client: { sheets: { spreadsheets: { batchUpdate } } },
    };
  });

  it("adds only missing structure and updates the version in one batch", async () => {
    const repository = new SpreadsheetRepository("sheet");
    const sheetsWithoutSignatures = data.meta.sheets.filter(
      (sheet) => sheet.title !== SHEET_SCHEMAS.signatures.title,
    );
    const upgradeable = {
      kind: "upgradeable" as const,
      meta: { ...data.meta, sheets: sheetsWithoutSignatures },
      issues: ["תתווסף לשונית: חתימות"],
      upgrade: {
        missingSheets: [SHEET_SCHEMAS.signatures.title],
        missingColumns: [
          {
            sheetTitle: SHEET_SCHEMAS.soldiers.title,
            startColumn: 4,
            headers: ["טלפון"],
          },
        ],
        settingsVersionRow: 2,
      },
    };
    vi.spyOn(repository, "inspect").mockResolvedValue(upgradeable);

    await repository.applyAdditiveSchemaUpgrade(upgradeable.meta);

    expect(batchUpdate).toHaveBeenCalledTimes(1);
    const requests = batchUpdate.mock.calls[0][0].resource.requests;
    expect(
      requests.some(
        (request: { addSheet?: { properties: { title: string } } }) =>
          request.addSheet?.properties.title === "חתימות",
      ),
    ).toBe(true);
    expect(
      requests.some(
        (request: {
          updateCells?: {
            range: { startColumnIndex?: number; endColumnIndex?: number };
          };
        }) =>
          request.updateCells?.range.startColumnIndex === 4 &&
          request.updateCells?.range.endColumnIndex === 5,
      ),
    ).toBe(true);
    const versionRequest = requests.at(-1).updateCells;
    expect(versionRequest.range.startColumnIndex).toBe(1);
    expect(
      versionRequest.rows[0].values.map(
        (value: { userEnteredValue: { stringValue?: string } }) =>
          value.userEnteredValue.stringValue,
      ),
    ).toEqual(["schema_version", "9"]);
  });
});

describe("lazy signature loading", () => {
  it("loads only the lightweight signature index during normal reads", async () => {
    const batchGet = vi.fn().mockResolvedValue({
      result: {
        valueRanges: [
          { values: [[...SHEET_SCHEMAS.signatures.headers]] },
          { values: [["2026-09-01T10:00:00.000Z", "1234567", "ישראל ישראלי"]] },
          { values: [["1"]] },
        ],
      },
    });
    (globalThis as typeof globalThis & { gapi: unknown }).gapi = {
      client: { sheets: { spreadsheets: { values: { batchGet } } } },
    };
    const repository = new SpreadsheetRepository("sheet");
    const rows = await (
      repository as unknown as {
        readAllVisibleSheets: (titles: string[]) => Promise<Record<string, unknown[][]>>;
      }
    ).readAllVisibleSheets([SHEET_SCHEMAS.signatures.title]);

    expect(batchGet).toHaveBeenCalledWith(
      expect.objectContaining({
        ranges: ["'חתימות'!A1:G1", "'חתימות'!A2:D", "'חתימות'!G2:G"],
      }),
    );
    expect(rows["חתימות"][1]).toEqual([
      "2026-09-01T10:00:00.000Z",
      "1234567",
      "ישראל ישראלי",
      "",
      "",
      "",
      "1",
    ]);
  });

  it("loads and validates one full signature row on demand", async () => {
    const timestamp = "2026-09-01T10:00:00.000Z";
    const snapshot = {
      version: 1,
      soldierPersonalNumber: soldier.personalNumber,
      soldierName: soldier.name,
      changes: [
        {
          action: "החתמה",
          method: "צל״מ",
          type: "נשק",
          variant: "",
          number: "123",
          quantity: 1,
        },
      ],
    };
    const get = vi.fn().mockResolvedValue({
      result: {
        values: [
          [
            timestamp,
            soldier.personalNumber,
            soldier.name,
            "admin@example.com",
            JSON.stringify(snapshot),
            JSON.stringify(signature),
            "1",
          ],
        ],
      },
    });
    (globalThis as typeof globalThis & { gapi: unknown }).gapi = {
      client: { sheets: { spreadsheets: { values: { get } } } },
    };
    const repository = new SpreadsheetRepository("sheet");
    const record = await repository.loadSignatureRecord(data, {
      row: 7,
      timestamp,
      personalNumber: soldier.personalNumber,
      soldierName: soldier.name,
      actor: "admin@example.com",
      formatVersion: "1",
    });

    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'חתימות'!A7:G7" }),
    );
    expect(record.signature).toEqual(signature);
    expect(record.snapshot).toEqual(snapshot);
  });
});

describe("repository permission enforcement", () => {
  const batchUpdate = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    batchUpdate.mockClear();
    (globalThis as typeof globalThis & { gapi: unknown }).gapi = {
      client: { sheets: { spreadsheets: { batchUpdate } } },
    };
  });

  it("rejects a duplicate soldier personal number before writing", async () => {
    const repository = new SpreadsheetRepository("sheet");

    await expect(
      repository.addSoldier(data, {
        name: "חייל נוסף",
        personalNumber: soldier.personalNumber,
        platoon: soldier.platoon,
        phone: "",
      }),
    ).rejects.toThrow("כבר קיים חייל עם המספר האישי הזה");
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it("blocks a scoped user from another platoon and management method", async () => {
    const repository = new SpreadsheetRepository("sheet");
    const otherSoldier = { ...soldier, row: 3, personalNumber: "7654321", platoon: "2" };
    const quantityItem = {
      row: 2,
      type: "חולצה",
      variant: "",
      variantLabel: "",
      method: "כמותי" as const,
      totalStock: 10,
      location: "",
      note: "",
      active: true,
    };
    const scopedData: CompanyData = {
      ...data,
      soldiers: [soldier, otherSoldier],
      catalog: [quantityItem],
      permissions: [
        {
          row: 2,
          email: "admin@example.com",
          admin: false,
          equipmentScope: "צל״מ",
          platoons: ["1"],
        },
      ],
      settings: { platoons: ["1", "2"], locations: [], schemaVersion: "8" },
    };

    await expect(
      repository.assignNumbered(
        scopedData,
        scopedData.numberedItems[0],
        otherSoldier,
        "",
      ),
    ).rejects.toThrow("מחלקה");
    await expect(
      repository.issueQuantity(scopedData, quantityItem, soldier, 1, ""),
    ).rejects.toThrow("סוג הציוד");
    expect(batchUpdate).not.toHaveBeenCalled();
  });

  it("limits platoon-scoped users to assignments, soldiers, and new numbered items", async () => {
    const repository = new SpreadsheetRepository("sheet");
    const quantityItem = {
      row: 2,
      type: "חולצה",
      variant: "",
      variantLabel: "",
      method: "כמותי" as const,
      totalStock: 10,
      location: "",
      note: "",
      active: true,
    };
    const numberedCatalog = {
      row: 3,
      type: "נשק",
      variant: "",
      variantLabel: "",
      method: "צל״מ" as const,
      totalStock: 0,
      location: "",
      note: "",
      active: true,
    };
    const scopedData: CompanyData = {
      ...data,
      catalog: [quantityItem, numberedCatalog],
      permissions: [
        {
          row: 2,
          email: "admin@example.com",
          admin: false,
          equipmentScope: "הכל",
          platoons: ["1"],
        },
      ],
    };

    await expect(
      repository.addCatalogItem(scopedData, {
        type: "קסדה",
        variant: "",
        variantLabel: "",
        method: "צל״מ",
        totalStock: 0,
        location: "",
        note: "",
      }),
    ).rejects.toThrow("מוגבל למחלקות");
    await expect(
      repository.editNumberedItem(scopedData, scopedData.numberedItems[0], {
        type: "נשק",
        variant: "",
        number: "123",
        status: "זמין",
        location: "",
        note: "עריכה",
      }),
    ).rejects.toThrow("מוגבל למחלקות");
    await expect(
      repository.adjustStock(scopedData, quantityItem, 11, ""),
    ).rejects.toThrow("מוגבל למחלקות");
    await expect(
      repository.setCatalogActive(scopedData, quantityItem, false),
    ).rejects.toThrow("מוגבל למחלקות");

    await repository.assignNumbered(
      scopedData,
      scopedData.numberedItems[0],
      soldier,
      "",
    );
    await repository.addNumberedItem(scopedData, {
      type: "נשק",
      variant: "",
      number: "124",
      status: "זמין",
      location: "",
      note: "",
    });

    expect(batchUpdate).toHaveBeenCalledTimes(2);
  });

  it("allows an all-platoons non-admin with numbered scope to add a catalog type", async () => {
    const repository = new SpreadsheetRepository("sheet");
    const scopedData: CompanyData = {
      ...data,
      permissions: [
        {
          row: 2,
          email: "admin@example.com",
          admin: false,
          equipmentScope: "צל״מ",
          platoons: [],
        },
      ],
    };

    await repository.addCatalogItem(scopedData, {
      type: "קסדה",
      variant: "",
      variantLabel: "",
      method: "צל״מ",
      totalStock: 0,
      location: "",
      standard: 5,
      note: "",
    });

    expect(batchUpdate).toHaveBeenCalledTimes(1);
    const catalogValues =
      batchUpdate.mock.calls[0][0].resource.requests[0].appendCells.rows[0]
        .values;
    expect(catalogValues[8].userEnteredValue.numberValue).toBe(5);
  });

  it("allows a non-admin with quantity scope to add and edit a quantity type", async () => {
    const repository = new SpreadsheetRepository("sheet");
    const quantityItem = {
      row: 2,
      type: "חולצה",
      variant: "",
      variantLabel: "",
      method: "כמותי" as const,
      totalStock: 0,
      location: "",
      note: "",
      active: true,
    };
    const scopedData: CompanyData = {
      ...data,
      catalog: [quantityItem],
      permissions: [
        {
          row: 2,
          email: "admin@example.com",
          admin: false,
          equipmentScope: "הכל",
          platoons: [],
        },
      ],
    };

    await repository.addCatalogItem(scopedData, {
      type: "חגורה",
      variant: "",
      variantLabel: "",
      method: "כמותי",
      totalStock: 4,
      location: "",
      note: "",
    });
    await repository.editCatalogItem(scopedData, quantityItem, {
      type: quantityItem.type,
      variant: quantityItem.variant,
      variantLabel: quantityItem.variantLabel,
      method: quantityItem.method,
      totalStock: 5,
      location: "",
      note: "עודכן",
    });

    expect(batchUpdate).toHaveBeenCalledTimes(2);
  });

  it("allows a non-admin to manage quantity stock and catalog lifecycle", async () => {
    const repository = new SpreadsheetRepository("sheet");
    const quantityItem = {
      row: 2,
      type: "חולצה",
      variant: "",
      variantLabel: "",
      method: "כמותי" as const,
      totalStock: 10,
      location: "",
      note: "",
      active: true,
    };
    const scopedData: CompanyData = {
      ...data,
      catalog: [quantityItem],
      permissions: [
        {
          row: 2,
          email: "admin@example.com",
          admin: false,
          equipmentScope: "כמותי",
          platoons: [],
        },
      ],
    };

    await repository.addCatalogItem(scopedData, {
      type: "חגורה",
      variant: "",
      variantLabel: "",
      method: "כמותי",
      totalStock: 1,
      location: "",
      note: "",
    });
    await repository.editCatalogItem(scopedData, quantityItem, {
      ...quantityItem,
      totalStock: 11,
      location: "",
    });
    await repository.adjustStock(scopedData, quantityItem, 12, "");
    await repository.setCatalogActive(scopedData, quantityItem, false);
    await repository.setCatalogActive(scopedData, quantityItem, true);

    expect(batchUpdate).toHaveBeenCalledTimes(5);
  });

  it("allows an admin to save permission definitions", async () => {
    const repository = new SpreadsheetRepository("sheet");
    const adminData: CompanyData = {
      ...data,
      permissions: [
        {
          row: 2,
          email: "admin@example.com",
          admin: true,
          equipmentScope: "הכל",
          platoons: [],
        },
      ],
    };
    await repository.savePermissions(adminData, [
      {
        email: "admin@example.com",
        admin: true,
        equipmentScope: "הכל",
        platoons: [],
      },
      {
        email: "user@example.com",
        admin: false,
        equipmentScope: "כמותי",
        platoons: ["1"],
      },
    ]);

    expect(batchUpdate).toHaveBeenCalledTimes(1);
    const requests = batchUpdate.mock.calls[0][0].resource.requests;
    expect(requests[0].updateCells.range.endColumnIndex).toBe(4);
    expect(requests[1].appendCells).toBeTruthy();
  });

  it("creates quantity equipment groups and blocks platoon-scoped editors", async () => {
    const repository = new SpreadsheetRepository("sheet");
    const quantityItem = {
      row: 2,
      type: "חולצה",
      variant: "M",
      variantLabel: "מידה",
      method: "כמותי" as const,
      totalStock: 10,
      location: "",
      note: "",
      active: true,
    };
    const groupInput = {
      name: "תיק לאו",
      note: "ערכה מלאה",
      items: [{ type: "חולצה", variant: "M", quantity: 2 }],
    };
    const allPlatoonsData: CompanyData = {
      ...data,
      catalog: [quantityItem],
    };

    await repository.addEquipmentGroup(allPlatoonsData, groupInput);
    const requests = batchUpdate.mock.calls[0][0].resource.requests;
    expect(requests).toHaveLength(3);
    expect(requests[0].appendCells.rows[0].values[0].userEnteredValue.stringValue)
      .toBe("תיק לאו");
    expect(requests[1].appendCells.rows[0].values[3].userEnteredValue.numberValue)
      .toBe(2);

    const platoonScopedData: CompanyData = {
      ...allPlatoonsData,
      permissions: [
        {
          row: 2,
          email: "admin@example.com",
          admin: false,
          equipmentScope: "כמותי",
          platoons: ["1"],
        },
      ],
    };
    await expect(
      repository.addEquipmentGroup(platoonScopedData, groupInput),
    ).rejects.toThrow("מוגבל למחלקות");
  });

  it("saves managed locations and prevents removing a location in use", async () => {
    const repository = new SpreadsheetRepository("sheet");
    const adminData: CompanyData = {
      ...data,
      permissions: [
        {
          row: 2,
          email: "admin@example.com",
          admin: true,
          equipmentScope: "הכל",
          platoons: [],
        },
      ],
    };

    await repository.saveSettings(adminData, {
      platoons: ["1"],
      locations: ["מחסן", "משרד"],
      schemaVersion: "8",
    });
    const rows = batchUpdate.mock.calls[0][0].resource.requests[0].updateCells.rows;
    const values = rows.map((row: { values: Array<{ userEnteredValue: { stringValue?: string } }> }) =>
      row.values.map((value) => value.userEnteredValue.stringValue),
    );
    expect(values).toContainEqual(["1", "location", "מחסן"]);

    const usedLocationData: CompanyData = {
      ...adminData,
      catalog: [],
      numberedItems: [
        {
          row: 2,
          type: "נשק",
          variant: "",
          number: "123",
          status: "זמין",
          assignedTo: "",
          location: "מחסן",
          note: "",
          active: true,
        },
      ],
      settings: {
        platoons: ["1"],
        locations: ["מחסן"],
        schemaVersion: "8",
      },
    };
    await expect(
      repository.saveSettings(usedLocationData, {
        platoons: ["1"],
        locations: [],
        schemaVersion: "8",
      }),
    ).rejects.toThrow("לא ניתן להסיר את המיקום מחסן");
  });
});
