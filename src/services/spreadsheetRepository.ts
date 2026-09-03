import type {
  AdditiveSchemaUpgrade,
  CatalogInput,
  CatalogItem,
  CompanyData,
  EquipmentStatus,
  EquipmentGroup,
  EquipmentGroupInput,
  EquipmentGroupItem,
  LoadResult,
  ManagedSettings,
  MovementDraft,
  MovementEntry,
  NumberedItem,
  NumberedItemInput,
  PermissionInput,
  PermissionRecord,
  QuantityHolding,
  Soldier,
  SoldierInput,
  SignatureRecord,
  SignatureSummary,
  SigningSessionInput,
  SigningSnapshot,
  SpreadsheetMeta,
} from "../domain/types";
import {
  additiveSchemaUpgrade,
  asNonNegativeInteger,
  catalogKey,
  holdingKey,
  isEquipmentStatus,
  isEquipmentScope,
  isManagementMethod,
  isWorkbookEmpty,
  normalizeText,
  numberedItemKey,
  parseActive,
  parseWriteMode,
  parseYes,
  SCHEMA_VERSION,
  SHEET_SCHEMAS,
  describeAdditiveUpgrade,
  validateHeaders,
} from "../domain/schema";
import {
  isValidSignature,
  parseSigningSnapshot,
  parseSignature,
  SIGNATURE_FORMAT_VERSION,
} from "../domain/signature";
import {
  canAccessMethod,
  canAccessPersonalNumber,
  canAccessSoldier,
  hasAllPlatoons,
  normalizeEmail,
  resolveUserAccess,
  validatePermissionInputs,
} from "../domain/permissions";
import {
  availableQuantity,
  canRemoveCatalogItem,
  canRemoveNumberedItem,
  canRemoveSoldier,
  holdingFor,
  issuedQuantity,
  validateCatalogInput,
  validateEquipmentGroupInput,
  validateNumberedIdentity,
  validateSoldierInput,
  validateStatusChange,
} from "../domain/rules";
import { APPS_SCRIPT_DEPLOYMENT_ID } from "./config";

type CellPrimitive = string | number | boolean;
type SheetRows = Record<string, unknown[][]>;

const resultOf = (response: any): any =>
  response?.result ?? (response?.body ? JSON.parse(response.body) : response);
const quoteSheet = (title: string): string =>
  `'${title.replaceAll("'", "''")}'`;
const cell = (value: CellPrimitive) =>
  typeof value === "boolean"
    ? { userEnteredValue: { boolValue: value } }
    : typeof value === "number"
      ? { userEnteredValue: { numberValue: value } }
      : { userEnteredValue: { stringValue: value } };
const rowData = (values: CellPrimitive[]) => ({ values: values.map(cell) });
const updateRow = (sheetId: number, row: number, values: CellPrimitive[]) => ({
  updateCells: {
    range: {
      sheetId,
      startRowIndex: row - 1,
      endRowIndex: row,
      startColumnIndex: 0,
      endColumnIndex: values.length,
    },
    rows: [rowData(values)],
    fields: "userEnteredValue",
  },
});
const appendRow = (sheetId: number, values: CellPrimitive[]) => ({
  appendCells: { sheetId, rows: [rowData(values)], fields: "userEnteredValue" },
});
const asRows = (response: any): unknown[][] => resultOf(response)?.values || [];
const asCellPrimitive = (value: unknown): CellPrimitive =>
  typeof value === "boolean" || typeof value === "number"
    ? value
    : String(value ?? "");

const CONCURRENCY_SHEETS = [
  "soldiers",
  "catalog",
  "numberedItems",
  "holdings",
  "equipmentGroups",
  "equipmentGroupItems",
  "permissions",
  "settings",
] as const;

interface CoordinatorResult {
  ok: boolean;
  code?: string;
  message?: string;
  rebased?: boolean;
  duplicate?: boolean;
}

export class SpreadsheetRepository {
  private latestData: CompanyData | null = null;
  private concurrencyNotice = "";
  private pendingRequestKeys = new Map<string, string>();

  constructor(private readonly spreadsheetId: string) {}

  takeConcurrencyNotice(): string {
    const notice = this.concurrencyNotice;
    this.concurrencyNotice = "";
    return notice;
  }

  async inspect(): Promise<LoadResult> {
    this.latestData = null;
    const [spreadsheet, user, editable] = await Promise.all([
      this.getSpreadsheet(),
      this.getUserProfile(),
      this.getEditability(),
    ]);
    const sheets = (spreadsheet.sheets || []).map((sheet: any) => ({
      id: Number(sheet.properties.sheetId),
      title: String(sheet.properties.title),
      rowCount: Number(sheet.properties.gridProperties?.rowCount || 0),
      columnCount: Number(sheet.properties.gridProperties?.columnCount || 0),
    }));
    const rows = await this.readAllVisibleSheets(
      sheets.map((sheet: { title: string }) => sheet.title),
    );
    const meta: SpreadsheetMeta = {
      spreadsheetId: this.spreadsheetId,
      title: spreadsheet.properties?.title || this.spreadsheetId,
      editable,
      userEmail: user.email,
      userName: user.name,
      sheets,
    };

    if (isWorkbookEmpty(meta, rows)) {
      const signatureSheet = meta.sheets.find(
        (sheet) => sheet.title === SHEET_SCHEMAS.signatures.title,
      );
      if (signatureSheet) {
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: quoteSheet(signatureSheet.title),
          valueRenderOption: "UNFORMATTED_VALUE",
        });
        rows[signatureSheet.title] = asRows(response);
      }
      if (isWorkbookEmpty(meta, rows)) return { kind: "empty", meta };
    }
    const issues = validateHeaders(meta, rows);
    if (issues.length) {
      const upgrade = additiveSchemaUpgrade(meta, rows);
      if (upgrade)
        return {
          kind: "upgradeable",
          meta,
          upgrade,
          issues: describeAdditiveUpgrade(upgrade),
        };
      return { kind: "incompatible", meta, issues };
    }
    try {
      const data = this.parseData(meta, rows);
      this.latestData = data;
      return { kind: "ready", data };
    } catch (error) {
      return {
        kind: "incompatible",
        meta,
        issues: [
          error instanceof Error ? error.message : "נתוני הגיליון אינם תקינים.",
        ],
      };
    }
  }

  async initializeEmptyWorkbook(meta: SpreadsheetMeta): Promise<void> {
    if (!meta.editable) throw new Error("אין הרשאת עריכה לגיליון.");
    const current = await this.inspect();
    if (current.kind !== "empty")
      throw new Error("הגיליון אינו ריק ולכן לא בוצעו שינויים.");
    const schemas = Object.values(SHEET_SCHEMAS);
    const existing = current.meta.sheets.map((sheet) => sheet.title);
    const requests: any[] = [];
    const unusedFirst = current.meta.sheets.find(
      (sheet) => !schemas.some((schema) => schema.title === sheet.title),
    );
    const missing = schemas.filter(
      (schema) => !existing.includes(schema.title),
    );
    if (unusedFirst && missing.length) {
      const first = missing.shift()!;
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId: unusedFirst.id,
            title: first.title,
            rightToLeft: true,
          },
          fields: "title,rightToLeft",
        },
      });
    }
    missing.forEach((schema) =>
      requests.push({
        addSheet: { properties: { title: schema.title, rightToLeft: true } },
      }),
    );
    if (requests.length) await this.batch(requests);
    await this.writeInitialSheets();
  }

  async applyAdditiveSchemaUpgrade(meta: SpreadsheetMeta): Promise<void> {
    if (!meta.editable) throw new Error("אין הרשאת עריכה לגיליון.");
    const current = await this.inspect();
    if (current.kind !== "upgradeable")
      throw new Error("מבנה הגיליון השתנה ולכן יש לטעון אותו מחדש.");
    if (!current.meta.editable) throw new Error("אין הרשאת עריכה לגיליון.");

    const upgrade: AdditiveSchemaUpgrade = current.upgrade;
    const sheetIds = new Map(
      current.meta.sheets.map((sheet) => [sheet.title, sheet.id]),
    );
    const usedSheetIds = new Set(current.meta.sheets.map((sheet) => sheet.id));
    let nextSheetId = 0;
    const allocateSheetId = () => {
      while (usedSheetIds.has(nextSheetId)) nextSheetId += 1;
      const allocated = nextSheetId;
      usedSheetIds.add(allocated);
      nextSheetId += 1;
      return allocated;
    };
    const requests: any[] = [];
    for (const title of upgrade.missingSheets) {
      const schema = Object.values(SHEET_SCHEMAS).find(
        (candidate) => candidate.title === title,
      );
      if (!schema) throw new Error("נמצא עדכון מבנה שאינו נתמך.");
      const sheetId = allocateSheetId();
      sheetIds.set(title, sheetId);
      requests.push(
        {
          addSheet: {
            properties: { sheetId, title, rightToLeft: true },
          },
        },
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: schema.headers.length,
            },
            rows: [rowData([...schema.headers])],
            fields: "userEnteredValue",
          },
        },
        this.headerFormatRequest(sheetId, 0, schema.headers.length),
        {
          setBasicFilter: {
            filter: {
              range: { sheetId, startRowIndex: 0, startColumnIndex: 0 },
            },
          },
        },
      );
    }
    for (const addition of upgrade.missingColumns) {
      const sheetId = sheetIds.get(addition.sheetTitle);
      if (sheetId === undefined)
        throw new Error("לא נמצאה לשונית לעדכון המבנה.");
      requests.push(
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: addition.startColumn,
              endColumnIndex:
                addition.startColumn + addition.headers.length,
            },
            rows: [rowData(addition.headers)],
            fields: "userEnteredValue",
          },
        },
        this.headerFormatRequest(
          sheetId,
          addition.startColumn,
          addition.startColumn + addition.headers.length,
        ),
      );
    }
    const settingsSheetId = sheetIds.get(SHEET_SCHEMAS.settings.title);
    if (settingsSheetId === undefined)
      throw new Error("לא נמצאה לשונית הגדרות לעדכון גרסת המבנה.");
    requests.push({
      updateCells: {
        range: {
          sheetId: settingsSheetId,
          startRowIndex: upgrade.settingsVersionRow - 1,
          endRowIndex: upgrade.settingsVersionRow,
          startColumnIndex: 1,
          endColumnIndex: 3,
        },
        rows: [rowData(["schema_version", SCHEMA_VERSION])],
        fields: "userEnteredValue",
      },
    });
    await this.batch(requests);
  }

  async addSoldier(data: CompanyData, input: SoldierInput): Promise<void> {
    this.ensureEditable(data);
    this.ensurePlatoonAccess(data, normalizeText(input.platoon));
    const errors = validateSoldierInput(input, data.soldiers);
    if (errors.length) throw new Error(errors[0]);
    await this.batch([
      appendRow(this.sheetId(data, "soldiers"), [
        normalizeText(input.name),
        normalizeText(input.personalNumber),
        normalizeText(input.platoon),
        true,
        normalizeText(input.phone),
      ]),
      this.movementRequest(data, {
        action: "הוספת חייל",
        newSoldier: normalizeText(input.personalNumber),
        note: normalizeText(input.name),
      }),
    ]);
  }

  async editSoldier(
    data: CompanyData,
    soldier: Soldier,
    input: SoldierInput,
  ): Promise<void> {
    soldier = this.currentSoldier(data, soldier);
    this.ensureEditable(data);
    this.ensureSoldierAccess(data, soldier);
    this.ensurePlatoonAccess(data, normalizeText(input.platoon));
    if (normalizeText(input.personalNumber) !== soldier.personalNumber)
      throw new Error("לא ניתן לשנות מספר אישי לאחר יצירת החייל.");
    const errors = validateSoldierInput(
      input,
      data.soldiers,
      soldier.personalNumber,
    );
    if (errors.length) throw new Error(errors[0]);
    await this.batch([
      updateRow(this.sheetId(data, "soldiers"), soldier.row, [
        normalizeText(input.name),
        soldier.personalNumber,
        normalizeText(input.platoon),
        soldier.active,
        normalizeText(input.phone),
      ]),
      this.movementRequest(data, {
        action: "עריכת חייל",
        newSoldier: soldier.personalNumber,
        note: normalizeText(input.name),
      }),
    ]);
  }

  async setSoldierActive(
    data: CompanyData,
    soldier: Soldier,
    active: boolean,
  ): Promise<void> {
    soldier = this.currentSoldier(data, soldier);
    this.ensureEditable(data);
    this.ensureSoldierAccess(data, soldier);
    const issue = active
      ? null
      : canRemoveSoldier(soldier, data.numberedItems, data.holdings);
    if (issue) throw new Error(issue);
    await this.batch([
      updateRow(this.sheetId(data, "soldiers"), soldier.row, [
        soldier.name,
        soldier.personalNumber,
        soldier.platoon,
        active,
        soldier.phone,
      ]),
      this.movementRequest(data, {
        action: active ? "הפעלת חייל" : "הסרת חייל",
        newSoldier: soldier.personalNumber,
        note: soldier.name,
      }),
    ]);
  }

  async addCatalogItem(data: CompanyData, input: CatalogInput): Promise<void> {
    this.ensureEditable(data);
    this.ensureMethodAccess(data, input.method);
    this.ensureAllPlatoons(data);
    const errors = validateCatalogInput(input, data.catalog);
    if (errors.length) throw new Error(errors[0]);
    this.ensureCatalogLocation(data, input);
    await this.batch([
      appendRow(this.sheetId(data, "catalog"), this.catalogRow(input, true)),
      this.movementRequest(data, {
        action: "הוספת סוג ציוד",
        method: input.method,
        type: normalizeText(input.type),
        variant: normalizeText(input.variant),
        quantity: input.totalStock,
        note: [
          input.standard == null ? "" : `תקן: ${input.standard}`,
          normalizeText(input.note),
        ]
          .filter(Boolean)
          .join(" · "),
      }),
    ]);
  }

  async editCatalogItem(
    data: CompanyData,
    item: CatalogItem,
    input: CatalogInput,
  ): Promise<void> {
    item = this.currentCatalogItem(data, item);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, item.method);
    this.ensureAllPlatoons(data);
    if (
      catalogKey(input.type, input.variant) !==
        catalogKey(item.type, item.variant) ||
      input.method !== item.method
    ) {
      throw new Error(
        "לא ניתן לשנות סוג, ערך מאפיין או שיטת ניהול לאחר יצירת הרשומה.",
      );
    }
    const errors = validateCatalogInput(input, data.catalog, item);
    if (errors.length) throw new Error(errors[0]);
    this.ensureCatalogLocation(data, input);
    if (
      input.method === "כמותי" &&
      input.totalStock < issuedQuantity(item, data.holdings)
    )
      throw new Error("המלאי הכולל אינו יכול להיות קטן מהכמות המוחזקת.");
    await this.batch([
      updateRow(
        this.sheetId(data, "catalog"),
        item.row,
        this.catalogRow(input, item.active),
      ),
      this.movementRequest(data, {
        action: "עריכת סוג ציוד",
        method: item.method,
        type: item.type,
        variant: item.variant,
        note: [
          (input.standard ?? null) === (item.standard ?? null)
            ? ""
            : `תקן: ${item.standard ?? "לא הוגדר"} ← ${input.standard ?? "לא הוגדר"}`,
          normalizeText(input.note),
        ]
          .filter(Boolean)
          .join(" · "),
      }),
    ]);
  }

  async setCatalogActive(
    data: CompanyData,
    item: CatalogItem,
    active: boolean,
  ): Promise<void> {
    item = this.currentCatalogItem(data, item);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, item.method);
    this.ensureAllPlatoons(data);
    const issue = active
      ? null
      : canRemoveCatalogItem(
          item,
          data.numberedItems,
          data.holdings,
          data.equipmentGroups,
          data.equipmentGroupItems,
        );
    if (issue) throw new Error(issue);
    await this.batch([
      updateRow(this.sheetId(data, "catalog"), item.row, [
        item.type,
        item.variant,
        item.variantLabel,
        item.method,
        item.totalStock,
        item.note,
        active,
        item.location,
        item.standard ?? "",
      ]),
      this.movementRequest(data, {
        action: active ? "הפעלת סוג ציוד" : "הסרת סוג ציוד",
        method: item.method,
        type: item.type,
        variant: item.variant,
      }),
    ]);
  }

  async addEquipmentGroup(
    data: CompanyData,
    input: EquipmentGroupInput,
  ): Promise<void> {
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "כמותי");
    this.ensureAllPlatoons(data);
    const normalized = this.normalizedEquipmentGroupInput(input);
    const errors = validateEquipmentGroupInput(normalized, data);
    if (errors.length) throw new Error(errors[0]);
    await this.batch([
      appendRow(this.sheetId(data, "equipmentGroups"), [
        normalized.name,
        normalized.note,
        true,
      ]),
      ...normalized.items.map((item) =>
        appendRow(this.sheetId(data, "equipmentGroupItems"), [
          normalized.name,
          item.type,
          item.variant,
          item.quantity,
          true,
        ]),
      ),
      this.movementRequest(data, {
        action: "הוספת ערכת ציוד",
        method: "כמותי",
        note: `${normalized.name} · ${normalized.items.length} פריטים`,
      }),
    ]);
  }

  async editEquipmentGroup(
    data: CompanyData,
    group: EquipmentGroup,
    input: EquipmentGroupInput,
  ): Promise<void> {
    group = this.currentEquipmentGroup(data, group);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "כמותי");
    this.ensureAllPlatoons(data);
    const normalized = this.normalizedEquipmentGroupInput(input);
    if (normalized.name !== group.name)
      throw new Error("לא ניתן לשנות את שם הערכה לאחר יצירתה.");
    const errors = validateEquipmentGroupInput(normalized, data, group);
    if (errors.length) throw new Error(errors[0]);
    const desired = new Map(
      normalized.items.map((item) => [catalogKey(item.type, item.variant), item]),
    );
    const existing = data.equipmentGroupItems.filter(
      (item) => item.groupName === group.name,
    );
    const existingKeys = new Set(
      existing.map((item) => catalogKey(item.type, item.variant)),
    );
    await this.batch([
      updateRow(this.sheetId(data, "equipmentGroups"), group.row, [
        group.name,
        normalized.note,
        group.active,
      ]),
      ...existing.map((item) => {
        const next = desired.get(catalogKey(item.type, item.variant));
        return updateRow(this.sheetId(data, "equipmentGroupItems"), item.row, [
          group.name,
          item.type,
          item.variant,
          next?.quantity ?? item.quantity,
          Boolean(next),
        ]);
      }),
      ...normalized.items
        .filter((item) => !existingKeys.has(catalogKey(item.type, item.variant)))
        .map((item) =>
          appendRow(this.sheetId(data, "equipmentGroupItems"), [
            group.name,
            item.type,
            item.variant,
            item.quantity,
            true,
          ]),
        ),
      this.movementRequest(data, {
        action: "עריכת ערכת ציוד",
        method: "כמותי",
        note: `${group.name} · ${normalized.items.length} פריטים`,
      }),
    ]);
  }

  async setEquipmentGroupActive(
    data: CompanyData,
    group: EquipmentGroup,
    active: boolean,
  ): Promise<void> {
    group = this.currentEquipmentGroup(data, group);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "כמותי");
    this.ensureAllPlatoons(data);
    if (active) {
      const items = data.equipmentGroupItems
        .filter((item) => item.groupName === group.name && item.active)
        .map(({ type, variant, quantity }) => ({ type, variant, quantity }));
      const errors = validateEquipmentGroupInput(
        { name: group.name, note: group.note, items },
        data,
        group,
      );
      if (errors.length) throw new Error(errors[0]);
    }
    await this.batch([
      updateRow(this.sheetId(data, "equipmentGroups"), group.row, [
        group.name,
        group.note,
        active,
      ]),
      this.movementRequest(data, {
        action: active ? "הפעלת ערכת ציוד" : "הסרת ערכת ציוד",
        method: "כמותי",
        note: group.name,
      }),
    ]);
  }

  async addNumberedItem(
    data: CompanyData,
    input: NumberedItemInput,
  ): Promise<void> {
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "צל״מ");
    const catalog = data.catalog.find(
      (item) =>
        item.active &&
        item.method === "צל״מ" &&
        catalogKey(item.type, item.variant) ===
          catalogKey(input.type, input.variant),
    );
    if (!catalog) throw new Error("סוג הצל״מ אינו קיים או אינו פעיל בקטלוג.");
    const errors = validateNumberedIdentity(
      input.type,
      input.number,
      data.numberedItems,
    );
    if (errors.length) throw new Error(errors[0]);
    this.ensureManagedLocation(data, input.location);
    await this.batch([
      appendRow(this.sheetId(data, "numberedItems"), [
        catalog.type,
        catalog.variant,
        normalizeText(input.number),
        "זמין",
        "",
        normalizeText(input.note),
        true,
        normalizeText(input.location),
      ]),
      this.movementRequest(data, {
        action: "הוספת פריט צל״מ",
        method: "צל״מ",
        type: catalog.type,
        variant: catalog.variant,
        number: normalizeText(input.number),
        quantity: 1,
        note: normalizeText(input.note),
      }),
    ]);
  }

  async editNumberedItem(
    data: CompanyData,
    item: NumberedItem,
    input: NumberedItemInput,
  ): Promise<void> {
    item = this.currentNumberedItem(data, item);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "צל״מ");
    this.ensureAllPlatoons(data);
    this.ensurePersonalNumberAccess(data, item.assignedTo);
    if (
      numberedItemKey(input.type, input.number) !==
        numberedItemKey(item.type, item.number) ||
      normalizeText(input.variant) !== item.variant
    )
      throw new Error("לא ניתן לשנות את זהות הפריט לאחר יצירתו.");
    const errors = validateNumberedIdentity(
      input.type,
      input.number,
      data.numberedItems,
      item,
    );
    if (errors.length) throw new Error(errors[0]);
    this.ensureManagedLocation(data, input.location);
    await this.batch([
      updateRow(this.sheetId(data, "numberedItems"), item.row, [
        item.type,
        item.variant,
        item.number,
        item.status,
        item.assignedTo,
        normalizeText(input.note),
        item.active,
        normalizeText(input.location),
      ]),
      this.movementRequest(data, {
        action: "עריכת פריט צל״מ",
        method: "צל״מ",
        type: item.type,
        variant: item.variant,
        number: item.number,
        note: normalizeText(input.note),
      }),
    ]);
  }

  async setNumberedItemActive(
    data: CompanyData,
    item: NumberedItem,
    active: boolean,
  ): Promise<void> {
    item = this.currentNumberedItem(data, item);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "צל״מ");
    this.ensureAllPlatoons(data);
    this.ensurePersonalNumberAccess(data, item.assignedTo);
    const issue = active ? null : canRemoveNumberedItem(item);
    if (issue) throw new Error(issue);
    await this.batch([
      updateRow(this.sheetId(data, "numberedItems"), item.row, [
        item.type,
        item.variant,
        item.number,
        item.status,
        item.assignedTo,
        item.note,
        active,
        item.location,
      ]),
      this.movementRequest(data, {
        action: active ? "הפעלת פריט צל״מ" : "הסרת פריט צל״מ",
        method: "צל״מ",
        type: item.type,
        variant: item.variant,
        number: item.number,
      }),
    ]);
  }

  async assignNumbered(
    data: CompanyData,
    item: NumberedItem,
    soldier: Soldier,
    note: string,
  ): Promise<void> {
    item = this.currentNumberedItem(data, item);
    soldier = this.currentSoldier(data, soldier);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "צל״מ");
    this.ensurePersonalNumberAccess(data, item.assignedTo);
    this.ensureSoldierAccess(data, soldier);
    if (!item.active || !soldier.active)
      throw new Error("לא ניתן להחתים רשומה לא פעילה.");
    if (!item.assignedTo && item.status !== "זמין")
      throw new Error("ניתן להחתים רק פריט זמין.");
    if (item.assignedTo === soldier.personalNumber)
      throw new Error("הפריט כבר מוחזק בידי חייל זה.");
    await this.batch([
      updateRow(this.sheetId(data, "numberedItems"), item.row, [
        item.type,
        item.variant,
        item.number,
        "משויך",
        soldier.personalNumber,
        item.note,
        item.active,
        item.location,
      ]),
      this.movementRequest(data, {
        action: item.assignedTo ? "העברה" : "החתמה",
        method: "צל״מ",
        type: item.type,
        variant: item.variant,
        number: item.number,
        quantity: 1,
        previousSoldier: item.assignedTo,
        newSoldier: soldier.personalNumber,
        note: normalizeText(note),
      }),
    ]);
  }

  async returnNumbered(
    data: CompanyData,
    item: NumberedItem,
    note: string,
  ): Promise<void> {
    item = this.currentNumberedItem(data, item);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "צל״מ");
    this.ensurePersonalNumberAccess(data, item.assignedTo);
    if (!item.assignedTo) throw new Error("הפריט אינו מוחזק בידי חייל.");
    await this.batch([
      updateRow(this.sheetId(data, "numberedItems"), item.row, [
        item.type,
        item.variant,
        item.number,
        "זמין",
        "",
        item.note,
        item.active,
        item.location,
      ]),
      this.movementRequest(data, {
        action: "החזרה",
        method: "צל״מ",
        type: item.type,
        variant: item.variant,
        number: item.number,
        quantity: 1,
        previousSoldier: item.assignedTo,
        note: normalizeText(note),
      }),
    ]);
  }

  async changeNumberedStatus(
    data: CompanyData,
    item: NumberedItem,
    status: EquipmentStatus,
    note: string,
  ): Promise<void> {
    item = this.currentNumberedItem(data, item);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "צל״מ");
    this.ensurePersonalNumberAccess(data, item.assignedTo);
    const errors = validateStatusChange(status, note);
    if (errors.length) throw new Error(errors[0]);
    if (item.assignedTo && status !== "משויך")
      throw new Error("יש להחזיר את הפריט לפני שינוי הסטטוס.");
    await this.batch([
      updateRow(this.sheetId(data, "numberedItems"), item.row, [
        item.type,
        item.variant,
        item.number,
        status,
        item.assignedTo,
        normalizeText(note) || item.note,
        item.active,
        item.location,
      ]),
      this.movementRequest(data, {
        action: "שינוי סטטוס",
        method: "צל״מ",
        type: item.type,
        variant: item.variant,
        number: item.number,
        quantity: 1,
        previousSoldier: item.assignedTo,
        newSoldier: item.assignedTo,
        note: `${item.status} ← ${status}${normalizeText(note) ? ` · ${normalizeText(note)}` : ""}`,
      }),
    ]);
  }

  async issueQuantity(
    data: CompanyData,
    item: CatalogItem,
    soldier: Soldier,
    quantity: number,
    note: string,
  ): Promise<void> {
    item = this.currentCatalogItem(data, item);
    soldier = this.currentSoldier(data, soldier);
    this.ensurePositiveQuantity(quantity);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "כמותי");
    this.ensureSoldierAccess(data, soldier);
    if (!item.active || item.method !== "כמותי" || !soldier.active)
      throw new Error("לא ניתן להחתים את הרשומה שנבחרה.");
    if (availableQuantity(item, data.holdings) < quantity)
      throw new Error("אין מספיק מלאי זמין.");
    const current = holdingFor(
      data.holdings,
      soldier.personalNumber,
      item.type,
      item.variant,
    );
    await this.batch([
      this.holdingWriteRequest(
        data,
        current,
        soldier.personalNumber,
        item,
        (current?.quantity || 0) + quantity,
      ),
      this.movementRequest(data, {
        action: "החתמה",
        method: "כמותי",
        type: item.type,
        variant: item.variant,
        quantity,
        newSoldier: soldier.personalNumber,
        note: normalizeText(note),
      }),
    ]);
  }

  async returnQuantity(
    data: CompanyData,
    item: CatalogItem,
    soldier: Soldier,
    quantity: number,
    note: string,
  ): Promise<void> {
    item = this.currentCatalogItem(data, item);
    soldier = this.currentSoldier(data, soldier);
    this.ensurePositiveQuantity(quantity);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "כמותי");
    this.ensureSoldierAccess(data, soldier);
    const current = holdingFor(
      data.holdings,
      soldier.personalNumber,
      item.type,
      item.variant,
    );
    if (!current || current.quantity < quantity)
      throw new Error("הכמות להחזרה גדולה מהכמות המוחזקת.");
    await this.batch([
      this.holdingWriteRequest(
        data,
        current,
        soldier.personalNumber,
        item,
        current.quantity - quantity,
      ),
      this.movementRequest(data, {
        action: "החזרה",
        method: "כמותי",
        type: item.type,
        variant: item.variant,
        quantity,
        previousSoldier: soldier.personalNumber,
        note: normalizeText(note),
      }),
    ]);
  }

  async transferQuantity(
    data: CompanyData,
    item: CatalogItem,
    from: Soldier,
    to: Soldier,
    quantity: number,
    note: string,
  ): Promise<void> {
    item = this.currentCatalogItem(data, item);
    from = this.currentSoldier(data, from);
    to = this.currentSoldier(data, to);
    this.ensurePositiveQuantity(quantity);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "כמותי");
    this.ensureSoldierAccess(data, from);
    this.ensureSoldierAccess(data, to);
    if (!to.active || from.personalNumber === to.personalNumber)
      throw new Error("יש לבחור חייל פעיל אחר.");
    const source = holdingFor(
      data.holdings,
      from.personalNumber,
      item.type,
      item.variant,
    );
    const target = holdingFor(
      data.holdings,
      to.personalNumber,
      item.type,
      item.variant,
    );
    if (!source || source.quantity < quantity)
      throw new Error("הכמות להעברה גדולה מהכמות המוחזקת.");
    await this.batch([
      this.holdingWriteRequest(
        data,
        source,
        from.personalNumber,
        item,
        source.quantity - quantity,
      ),
      this.holdingWriteRequest(
        data,
        target,
        to.personalNumber,
        item,
        (target?.quantity || 0) + quantity,
      ),
      this.movementRequest(data, {
        action: "העברה",
        method: "כמותי",
        type: item.type,
        variant: item.variant,
        quantity,
        previousSoldier: from.personalNumber,
        newSoldier: to.personalNumber,
        note: normalizeText(note),
      }),
    ]);
  }

  async adjustStock(
    data: CompanyData,
    item: CatalogItem,
    totalStock: number,
    note: string,
  ): Promise<void> {
    item = this.currentCatalogItem(data, item);
    this.ensureEditable(data);
    this.ensureMethodAccess(data, "כמותי");
    this.ensureAllPlatoons(data);
    if (
      item.method !== "כמותי" ||
      !Number.isInteger(totalStock) ||
      totalStock < 0
    )
      throw new Error("המלאי הכולל חייב להיות מספר שלם שאינו שלילי.");
    if (totalStock < issuedQuantity(item, data.holdings))
      throw new Error("המלאי הכולל אינו יכול להיות קטן מהכמות המוחזקת.");
    const delta = totalStock - item.totalStock;
    if (!delta) throw new Error("לא חל שינוי במלאי.");
    if (delta < 0 && !normalizeText(note))
      throw new Error("חובה להוסיף הערה בעת הפחתת מלאי.");
    await this.batch([
      updateRow(this.sheetId(data, "catalog"), item.row, [
        item.type,
        item.variant,
        item.variantLabel,
        item.method,
        totalStock,
        item.note,
        item.active,
        item.location,
        item.standard ?? "",
      ]),
      this.movementRequest(data, {
        action: delta > 0 ? "הוספת מלאי" : "הפחתת מלאי",
        method: "כמותי",
        type: item.type,
        variant: item.variant,
        quantity: Math.abs(delta),
        note: normalizeText(note),
      }),
    ]);
  }

  async saveSigningSession(
    data: CompanyData,
    soldier: Soldier,
    input: SigningSessionInput,
  ): Promise<MovementEntry[]> {
    this.ensureEditable(data);
    soldier = this.currentSoldier(data, soldier);
    this.ensureSoldierAccess(data, soldier);
    if (input.numberedToAssign.length || input.numberedToReturn.length)
      this.ensureMethodAccess(data, "צל״מ");
    if (input.quantityTargets.length) this.ensureMethodAccess(data, "כמותי");
    const timestamp = new Date().toISOString();
    const requests: any[] = [];
    const drafts: MovementDraft[] = [];
    const assignedKeys = new Set(
      input.numberedToAssign.map((item) =>
        numberedItemKey(item.type, item.number),
      ),
    );
    const returnedKeys = new Set(
      input.numberedToReturn.map((item) =>
        numberedItemKey(item.type, item.number),
      ),
    );
    if (
      assignedKeys.size !== input.numberedToAssign.length ||
      returnedKeys.size !== input.numberedToReturn.length ||
      [...assignedKeys].some((key) => returnedKeys.has(key))
    ) {
      throw new Error("טיוטת ההחתמה מכילה פריטי צל״מ כפולים.");
    }

    for (const requested of input.numberedToReturn) {
      const item = this.currentNumberedItem(data, requested);
      if (item.assignedTo !== soldier.personalNumber)
        throw new Error(
          `הפריט ${item.type} ${item.number} כבר אינו משויך לחייל.`,
        );
      requests.push(
        updateRow(this.sheetId(data, "numberedItems"), item.row, [
          item.type,
          item.variant,
          item.number,
          "זמין",
          "",
          item.note,
          item.active,
          item.location,
        ]),
      );
      drafts.push({
        action: "החזרה",
        method: "צל״מ",
        type: item.type,
        variant: item.variant,
        number: item.number,
        quantity: 1,
        previousSoldier: soldier.personalNumber,
      });
    }

    for (const requested of input.numberedToAssign) {
      const item = this.currentNumberedItem(data, requested);
      if (
        !soldier.active ||
        !item.active ||
        item.status !== "זמין" ||
        item.assignedTo
      )
        throw new Error(`הפריט ${item.type} ${item.number} אינו זמין להחתמה.`);
      requests.push(
        updateRow(this.sheetId(data, "numberedItems"), item.row, [
          item.type,
          item.variant,
          item.number,
          "משויך",
          soldier.personalNumber,
          item.note,
          item.active,
          item.location,
        ]),
      );
      drafts.push({
        action: "החתמה",
        method: "צל״מ",
        type: item.type,
        variant: item.variant,
        number: item.number,
        quantity: 1,
        newSoldier: soldier.personalNumber,
      });
    }

    const quantityKeys = new Set<string>();
    for (const target of input.quantityTargets) {
      const item = this.currentCatalogItem(data, target.item);
      const key = catalogKey(item.type, item.variant);
      if (quantityKeys.has(key))
        throw new Error("טיוטת ההחתמה מכילה ציוד כמותי כפול.");
      quantityKeys.add(key);
      if (
        item.method !== "כמותי" ||
        !Number.isInteger(target.quantity) ||
        target.quantity < 0
      )
        throw new Error("כמות הציוד חייבת להיות מספר שלם שאינו שלילי.");
      const current = holdingFor(
        data.holdings,
        soldier.personalNumber,
        item.type,
        item.variant,
      );
      const previousQuantity = current?.quantity || 0;
      const delta = target.quantity - previousQuantity;
      if (!delta) continue;
      if (delta > 0) {
        if (!soldier.active || !item.active)
          throw new Error(`לא ניתן להחתים את ${item.type}.`);
        if (availableQuantity(item, data.holdings) < delta)
          throw new Error(`אין מספיק מלאי זמין עבור ${item.type}.`);
      }
      requests.push(
        this.holdingWriteRequest(
          data,
          current,
          soldier.personalNumber,
          item,
          target.quantity,
        ),
      );
      drafts.push({
        action: delta > 0 ? "החתמה" : "החזרה",
        method: "כמותי",
        type: item.type,
        variant: item.variant,
        quantity: Math.abs(delta),
        previousSoldier: delta < 0 ? soldier.personalNumber : "",
        newSoldier: delta > 0 ? soldier.personalNumber : "",
      });
    }

    if (!drafts.length) throw new Error("לא בוצעו שינויים בהחתמה.");
    if (!isValidSignature(input.signature))
      throw new Error("יש להשלים חתימה תקינה לפני שמירת ההחתמה.");
    const snapshot: SigningSnapshot = {
      version: 1,
      soldierPersonalNumber: soldier.personalNumber,
      soldierName: soldier.name,
      changes: drafts.map((draft) => ({
        action: draft.action,
        method: draft.method || "",
        type: draft.type || "",
        variant: draft.variant || "",
        number: draft.number || "",
        quantity: draft.quantity || 0,
      })),
    };
    requests.push(
      ...drafts.map((draft) => this.movementRequest(data, draft, timestamp)),
      appendRow(this.sheetId(data, "signatures"), [
        timestamp,
        soldier.personalNumber,
        soldier.name,
        data.meta.userEmail,
        JSON.stringify(snapshot),
        JSON.stringify(input.signature),
        SIGNATURE_FORMAT_VERSION,
      ]),
    );
    await this.batch(requests);
    return drafts.map((draft, index) => ({
      row: index,
      timestamp,
      action: draft.action,
      method: draft.method || "",
      type: draft.type || "",
      variant: draft.variant || "",
      number: draft.number || "",
      quantity: draft.quantity || 0,
      previousSoldier: draft.previousSoldier || "",
      newSoldier: draft.newSoldier || "",
      actor: data.meta.userEmail,
      note: draft.note || "",
    }));
  }

  async loadSignatureRecord(
    data: CompanyData,
    summary: SignatureSummary,
  ): Promise<SignatureRecord> {
    this.ensurePersonalNumberAccess(data, summary.personalNumber);
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${quoteSheet(SHEET_SCHEMAS.signatures.title)}!A${summary.row}:G${summary.row}`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const row = asRows(response)[0] ?? [];
    const timestamp = normalizeText(row[0]);
    const personalNumber = normalizeText(row[1]);
    const formatVersion = normalizeText(row[6]);
    if (
      timestamp !== summary.timestamp ||
      personalNumber !== summary.personalNumber
    )
      throw new Error("רשומת החתימה השתנתה. יש לרענן את הנתונים.");
    const snapshot = parseSigningSnapshot(row[4]);
    const signature = parseSignature(row[5]);
    if (
      !snapshot ||
      !signature ||
      formatVersion !== SIGNATURE_FORMAT_VERSION ||
      snapshot.soldierPersonalNumber !== personalNumber
    )
      throw new Error("נתוני החתימה אינם תקינים.");
    return {
      row: summary.row,
      timestamp,
      personalNumber,
      soldierName: normalizeText(row[2]),
      actor: normalizeText(row[3]),
      snapshot,
      signature,
      formatVersion,
    };
  }

  async saveSettings(
    data: CompanyData,
    settings: ManagedSettings,
  ): Promise<void> {
    this.ensureEditable(data);
    this.ensureAdmin(data);
    const unique = [
      ...new Set(settings.platoons.map(normalizeText).filter(Boolean)),
    ];
    const locations = [
      ...new Set(settings.locations.map(normalizeText).filter(Boolean)),
    ];
    const referencedPlatoons = new Set([
      ...data.soldiers.map((soldier) => soldier.platoon),
      ...data.permissions.flatMap((permission) => permission.platoons),
    ]);
    const removedReferenced = [...referencedPlatoons].find(
      (platoon) => platoon && !unique.includes(platoon),
    );
    if (removedReferenced)
      throw new Error(
        `לא ניתן להסיר את מחלקה ${removedReferenced} כל עוד חיילים או הרשאות משתמשים בה.`,
      );
    const removedLocation = [...data.catalog, ...data.numberedItems].find(
      (item) => item.location && !locations.includes(item.location),
    )?.location;
    if (removedLocation)
      throw new Error(
        `לא ניתן להסיר את המיקום ${removedLocation} כל עוד ציוד משתמש בו.`,
      );
    const rowCount =
      Math.max(
        data.settings.platoons.length,
        data.settings.locations.length,
        unique.length,
        locations.length,
      ) + 3;
    const rows: CellPrimitive[][] = [[...SHEET_SCHEMAS.settings.headers]];
    for (let index = 0; index < rowCount - 3; index += 1)
      rows.push([
        unique[index] || "",
        locations[index] ? "location" : "",
        locations[index] || "",
      ]);
    rows.push(["", "write_mode", settings.writeMode]);
    rows.push(["", "schema_version", SCHEMA_VERSION]);
    await this.batch([
      {
        updateCells: {
          range: {
            sheetId: this.sheetId(data, "settings"),
            startRowIndex: 0,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: 3,
          },
          rows: rows.map(rowData),
          fields: "userEnteredValue",
        },
      },
      this.movementRequest(data, {
        action: "עדכון הגדרות",
        note: `מחלקות: ${unique.join(", ")} · מיקומים: ${locations.join(", ")}`,
      }),
    ]);
  }

  async setWriteMode(
    data: CompanyData,
    mode: "coordinated" | "direct",
  ): Promise<void> {
    this.ensureEditable(data);
    this.ensureAdmin(data);
    const title = SHEET_SCHEMAS.settings.title;
    const rows = data.sourceRows?.[title] || [];
    const existingIndex = rows.findIndex(
      (row) => normalizeText(row[1]) === "write_mode",
    );
    const settingRequest =
      existingIndex >= 0
        ? {
            updateCells: {
              range: {
                sheetId: this.sheetId(data, "settings"),
                startRowIndex: existingIndex,
                endRowIndex: existingIndex + 1,
                startColumnIndex: 1,
                endColumnIndex: 3,
              },
              rows: [rowData(["write_mode", mode])],
              fields: "userEnteredValue",
            },
          }
        : appendRow(this.sheetId(data, "settings"), ["", "write_mode", mode]);
    const requestKey = this.newRequestKey();
    const requests = this.addRequestKey(
      [
        settingRequest,
        this.movementRequest(data, {
          action: "שינוי מצב שמירה",
          note:
            mode === "direct"
              ? "הפעלת שמירה ישירה במצב חירום"
              : "חזרה לשמירה מוגנת",
        }),
      ],
      data,
      requestKey,
    );
    await this.directBatch(requests);
  }

  async savePermissions(
    data: CompanyData,
    inputs: PermissionInput[],
  ): Promise<void> {
    this.ensureEditable(data);
    this.ensureAdmin(data);
    const normalized = inputs.map((input) => {
      const admin = Boolean(input.admin);
      return {
        email: normalizeEmail(input.email),
        admin,
        equipmentScope: admin ? ("הכל" as const) : input.equipmentScope,
        platoons: admin
          ? []
          : [...new Set(input.platoons.map(normalizeText).filter(Boolean))],
      };
    });
    const errors = validatePermissionInputs(
      normalized,
      data.settings.platoons,
      true,
    );
    if (errors.length) throw new Error(errors[0]);
    const rowCount = Math.max(data.permissions.length, normalized.length) + 1;
    const rows: CellPrimitive[][] = [
      [...SHEET_SCHEMAS.permissions.headers],
      ...normalized.map((permission) => [
        permission.email,
        permission.admin,
        permission.equipmentScope,
        permission.platoons.join(", "),
      ]),
    ];
    while (rows.length < rowCount) rows.push(["", "", "", ""]);
    await this.batch([
      {
        updateCells: {
          range: {
            sheetId: this.sheetId(data, "permissions"),
            startRowIndex: 0,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: 4,
          },
          rows: rows.map(rowData),
          fields: "userEnteredValue",
        },
      },
      this.movementRequest(data, {
        action: "עדכון הרשאות",
        note: normalized.map((permission) => permission.email).join(", "),
      }),
    ]);
  }

  private parseData(meta: SpreadsheetMeta, rows: SheetRows): CompanyData {
    const soldiers: Soldier[] = (rows[SHEET_SCHEMAS.soldiers.title] || [])
      .slice(1)
      .map((row, index) => ({
        row: index + 2,
        name: normalizeText(row[0]),
        personalNumber: normalizeText(row[1]),
        platoon: normalizeText(row[2]),
        active: parseActive(row[3]),
        phone: normalizeText(row[4]),
      }))
      .filter((soldier) => soldier.name || soldier.personalNumber);
    const catalog: CatalogItem[] = (rows[SHEET_SCHEMAS.catalog.title] || [])
      .slice(1)
      .map((row, index) => {
        const method = normalizeText(row[3]);
        if (!isManagementMethod(method))
          throw new Error(`שיטת ניהול לא תקינה בקטלוג, שורה ${index + 2}.`);
        const standardText = normalizeText(row[8]);
        const standard = standardText === "" ? null : Number(standardText);
        if (
          standard != null &&
          (!Number.isInteger(standard) || standard < 0)
        )
          throw new Error(`תקן לא תקין בקטלוג, שורה ${index + 2}.`);
        return {
          row: index + 2,
          type: normalizeText(row[0]),
          variant: normalizeText(row[1]),
          variantLabel: normalizeText(row[2]),
          method,
          totalStock: asNonNegativeInteger(row[4]),
          note: normalizeText(row[5]),
          active: parseActive(row[6]),
          location: normalizeText(row[7]),
          standard,
        };
      })
      .filter((item) => item.type || item.variant);
    const numberedItems: NumberedItem[] = (
      rows[SHEET_SCHEMAS.numberedItems.title] || []
    )
      .slice(1)
      .map((row, index) => {
        const status = normalizeText(row[3]) || "זמין";
        if (!isEquipmentStatus(status))
          throw new Error(`סטטוס לא תקין בפריטי צל״מ, שורה ${index + 2}.`);
        return {
          row: index + 2,
          type: normalizeText(row[0]),
          variant: normalizeText(row[1]),
          number: normalizeText(row[2]),
          status,
          assignedTo: normalizeText(row[4]),
          note: normalizeText(row[5]),
          active: parseActive(row[6]),
          location: normalizeText(row[7]),
        };
      })
      .filter((item) => item.type || item.number);
    const holdings: QuantityHolding[] = (
      rows[SHEET_SCHEMAS.holdings.title] || []
    )
      .slice(1)
      .map((row, index) => ({
        row: index + 2,
        personalNumber: normalizeText(row[0]),
        type: normalizeText(row[1]),
        variant: normalizeText(row[2]),
        quantity: asNonNegativeInteger(row[3]),
      }))
      .filter((holding) => holding.personalNumber || holding.type);
    const equipmentGroups: EquipmentGroup[] = (
      rows[SHEET_SCHEMAS.equipmentGroups.title] || []
    )
      .slice(1)
      .map((row, index) => ({
        row: index + 2,
        name: normalizeText(row[0]),
        note: normalizeText(row[1]),
        active: parseActive(row[2]),
      }))
      .filter((group) => group.name);
    const equipmentGroupItems: EquipmentGroupItem[] = (
      rows[SHEET_SCHEMAS.equipmentGroupItems.title] || []
    )
      .slice(1)
      .map((row, index) => ({
        row: index + 2,
        groupName: normalizeText(row[0]),
        type: normalizeText(row[1]),
        variant: normalizeText(row[2]),
        quantity: asNonNegativeInteger(row[3]),
        active: parseActive(row[4]),
      }))
      .filter((item) => item.groupName || item.type);
    const movements: MovementEntry[] = (
      rows[SHEET_SCHEMAS.movements.title] || []
    )
      .slice(1)
      .map((row, index) => {
        const rawMethod = normalizeText(row[2]);
        const method: MovementEntry["method"] = isManagementMethod(rawMethod)
          ? rawMethod
          : "";
        return {
          row: index + 2,
          timestamp: normalizeText(row[0]),
          action: normalizeText(row[1]),
          method,
          type: normalizeText(row[3]),
          variant: normalizeText(row[4]),
          number: normalizeText(row[5]),
          quantity: asNonNegativeInteger(row[6]),
          previousSoldier: normalizeText(row[7]),
          newSoldier: normalizeText(row[8]),
          actor: normalizeText(row[9]),
          note: normalizeText(row[10]),
          requestKey: normalizeText(row[11]),
        };
      })
      .filter((entry) => entry.timestamp || entry.action);
    const signatures: SignatureSummary[] = (
      rows[SHEET_SCHEMAS.signatures.title] || []
    )
      .slice(1)
      .map((row, index) => ({
          row: index + 2,
          timestamp: normalizeText(row[0]),
          personalNumber: normalizeText(row[1]),
          soldierName: normalizeText(row[2]),
          actor: normalizeText(row[3]),
          formatVersion: normalizeText(row[6]),
        }))
      .filter((record) => record.timestamp || record.personalNumber);
    signatures.forEach((record) => {
      if (
        !record.timestamp ||
        !record.personalNumber ||
        !record.soldierName ||
        record.formatVersion !== SIGNATURE_FORMAT_VERSION
      )
        throw new Error(`פרטי חתימה חסרים בשורה ${record.row}.`);
    });
    const permissions: PermissionRecord[] = (
      rows[SHEET_SCHEMAS.permissions.title] || []
    )
      .slice(1)
      .map((row, index) => {
        const equipmentScope = normalizeText(row[2]) || "הכל";
        if (!isEquipmentScope(equipmentScope))
          throw new Error(`היקף ציוד לא תקין בהרשאות, שורה ${index + 2}.`);
        return {
          row: index + 2,
          email: normalizeEmail(normalizeText(row[0])),
          admin: parseYes(row[1]),
          equipmentScope,
          platoons: normalizeText(row[3])
            .split(/[,،;\n]/)
            .map(normalizeText)
            .filter(Boolean),
        };
      })
      .filter((permission) => permission.email);
    const settingRows = (rows[SHEET_SCHEMAS.settings.title] || []).slice(1);
    const rawWriteMode = normalizeText(
      settingRows.find((row) => normalizeText(row[1]) === "write_mode")?.[2],
    );
    const parsedWriteMode = parseWriteMode(rawWriteMode);
    const settings: ManagedSettings = {
      platoons: [
        ...new Set(
          settingRows.map((row) => normalizeText(row[0])).filter(Boolean),
        ),
      ],
      locations: [
        ...new Set(
          settingRows
            .filter((row) => normalizeText(row[1]) === "location")
            .map((row) => normalizeText(row[2]))
            .filter(Boolean),
        ),
      ],
      schemaVersion: normalizeText(
        settingRows.find(
          (row) => normalizeText(row[1]) === "schema_version",
        )?.[2],
      ),
      writeMode: parsedWriteMode.mode,
      writeModeIssue: parsedWriteMode.invalid,
    };

    const soldierKeys = new Set<string>();
    soldiers.forEach((soldier) => {
      if (!soldier.name || !soldier.personalNumber || !soldier.platoon)
        throw new Error(`פרטי חייל חסרים בשורה ${soldier.row}.`);
      if (soldierKeys.has(soldier.personalNumber))
        throw new Error(`מספר אישי כפול: ${soldier.personalNumber}.`);
      soldierKeys.add(soldier.personalNumber);
    });
    const catalogKeys = new Set<string>();
    catalog.forEach((item) => {
      const key = catalogKey(item.type, item.variant);
      if (!item.type) throw new Error(`סוג ציוד חסר בקטלוג, שורה ${item.row}.`);
      if (catalogKeys.has(key))
        throw new Error(
          `סוג וערך מאפיין כפולים בקטלוג: ${item.type} ${item.variant}.`,
        );
      catalogKeys.add(key);
    });
    const groupNames = new Set<string>();
    equipmentGroups.forEach((group) => {
      if (groupNames.has(group.name))
        throw new Error(`שם ערכה כפול: ${group.name}.`);
      groupNames.add(group.name);
    });
    const activeGroupNames = new Set(
      equipmentGroups.filter((group) => group.active).map((group) => group.name),
    );
    const groupItemKeys = new Set<string>();
    equipmentGroupItems.forEach((component) => {
      if (!groupNames.has(component.groupName))
        throw new Error(`ערכה לא קיימת בפריטי ערכה, שורה ${component.row}.`);
      const key = `${component.groupName}\u0000${catalogKey(component.type, component.variant)}`;
      if (groupItemKeys.has(key))
        throw new Error(`פריט כפול בערכה ${component.groupName}.`);
      groupItemKeys.add(key);
      if (component.quantity <= 0)
        throw new Error(`כמות לא תקינה בפריטי ערכה, שורה ${component.row}.`);
      if (
        component.active &&
        activeGroupNames.has(component.groupName) &&
        !catalog.some(
          (item) =>
            item.active &&
            item.method === "כמותי" &&
            catalogKey(item.type, item.variant) ===
              catalogKey(component.type, component.variant),
        )
      )
        throw new Error(`פריט ערכה אינו ציוד כמותי פעיל, שורה ${component.row}.`);
    });
    activeGroupNames.forEach((name) => {
      if (
        !equipmentGroupItems.some(
          (component) => component.groupName === name && component.active,
        )
      )
        throw new Error(`הערכה ${name} אינה מכילה פריטים פעילים.`);
    });
    const numberedKeys = new Set<string>();
    numberedItems.forEach((item) => {
      const key = numberedItemKey(item.type, item.number);
      if (!item.type || !item.number)
        throw new Error(`פרטי ציוד חסרים בפריטי צל״מ, שורה ${item.row}.`);
      if (numberedKeys.has(key))
        throw new Error(`מספר מזהה כפול בסוג ${item.type}: ${item.number}.`);
      if (
        !catalog.some(
          (catalogItem) =>
            catalogItem.method === "צל״מ" &&
            catalogKey(catalogItem.type, catalogItem.variant) ===
              catalogKey(item.type, item.variant),
        )
      )
        throw new Error(`פריט צל״מ בשורה ${item.row} אינו קיים בקטלוג.`);
      if (item.assignedTo && item.status !== "משויך")
        throw new Error(
          `השיוך והסטטוס אינם תואמים בפריט צל״מ, שורה ${item.row}.`,
        );
      if (!item.assignedTo && item.status === "משויך")
        throw new Error(`חסר חייל משויך בפריט צל״מ, שורה ${item.row}.`);
      if (item.assignedTo && !soldierKeys.has(item.assignedTo))
        throw new Error(`מספר אישי משויך אינו קיים, שורה ${item.row}.`);
      numberedKeys.add(key);
    });
    const holdingKeys = new Set<string>();
    holdings.forEach((holding) => {
      const key = holdingKey(
        holding.personalNumber,
        holding.type,
        holding.variant,
      );
      if (holdingKeys.has(key))
        throw new Error(`רשומת החזקה כמותית כפולה בשורה ${holding.row}.`);
      if (!soldierKeys.has(holding.personalNumber))
        throw new Error(
          `מספר אישי אינו קיים בהחזקות כמותיות, שורה ${holding.row}.`,
        );
      if (
        !catalog.some(
          (item) =>
            item.method === "כמותי" &&
            catalogKey(item.type, item.variant) ===
              catalogKey(holding.type, holding.variant),
        )
      )
        throw new Error(`ציוד כמותי בשורה ${holding.row} אינו קיים בקטלוג.`);
      holdingKeys.add(key);
    });
    catalog
      .filter((item) => item.method === "כמותי")
      .forEach((item) => {
        if (issuedQuantity(item, holdings) > item.totalStock)
          throw new Error(`הכמות המוחזקת של ${item.type} גדולה מהמלאי הכולל.`);
      });
    const permissionErrors = validatePermissionInputs(
      permissions,
      settings.platoons,
    );
    if (permissionErrors.length) throw new Error(permissionErrors[0]);
    if (settings.schemaVersion !== SCHEMA_VERSION)
      throw new Error(
        `גרסת מבנה הגיליון אינה נתמכת (${settings.schemaVersion || "חסרה"}).`,
      );
    return {
      meta,
      soldiers,
      catalog,
      numberedItems,
      holdings,
      equipmentGroups,
      equipmentGroupItems,
      movements,
      signatures,
      permissions,
      settings,
      sourceRows: Object.fromEntries(
        Object.entries(rows).map(([title, sheetRows]) => [
          title,
          sheetRows.map((row) => row.map(asCellPrimitive)),
        ]),
      ),
    };
  }

  private catalogRow(input: CatalogInput, active: boolean): CellPrimitive[] {
    return [
      normalizeText(input.type),
      normalizeText(input.variant),
      normalizeText(input.variantLabel),
      input.method,
      input.method === "כמותי" ? input.totalStock : 0,
      normalizeText(input.note),
      active,
      input.method === "כמותי" ? normalizeText(input.location) : "",
      input.standard ?? "",
    ];
  }

  private ensureCatalogLocation(data: CompanyData, input: CatalogInput) {
    const location = normalizeText(input.location);
    if (input.method !== "כמותי" && location)
      throw new Error("מיקום זמין לציוד כמותי בלבד.");
    if (location && !data.settings.locations.includes(location))
      throw new Error("יש לבחור מיקום מרשימת המיקומים בהגדרות.");
  }

  private ensureManagedLocation(data: CompanyData, locationValue: string) {
    const location = normalizeText(locationValue);
    if (location && !data.settings.locations.includes(location))
      throw new Error("יש לבחור מיקום מרשימת המיקומים בהגדרות.");
  }

  private normalizedEquipmentGroupInput(
    input: EquipmentGroupInput,
  ): EquipmentGroupInput {
    return {
      name: normalizeText(input.name),
      note: normalizeText(input.note),
      items: input.items.map((item) => ({
        type: normalizeText(item.type),
        variant: normalizeText(item.variant),
        quantity: Number(item.quantity),
      })),
    };
  }

  private currentEquipmentGroup(
    data: CompanyData,
    group: EquipmentGroup,
  ): EquipmentGroup {
    const current = data.equipmentGroups.find(
      (candidate) => candidate.name === group.name,
    );
    if (!current) throw new Error("הערכה השתנתה או אינה קיימת עוד.");
    return current;
  }

  private currentNumberedItem(
    data: CompanyData,
    item: NumberedItem,
  ): NumberedItem {
    const current = data.numberedItems.find(
      (candidate) =>
        numberedItemKey(candidate.type, candidate.number) ===
        numberedItemKey(item.type, item.number),
    );
    if (!current) throw new Error("הפריט השתנה או אינו קיים עוד.");
    return current;
  }

  private currentCatalogItem(
    data: CompanyData,
    item: CatalogItem,
  ): CatalogItem {
    const current = data.catalog.find(
      (candidate) =>
        catalogKey(candidate.type, candidate.variant) ===
        catalogKey(item.type, item.variant),
    );
    if (!current) throw new Error("סוג הציוד השתנה או אינו קיים עוד.");
    return current;
  }

  private currentSoldier(data: CompanyData, soldier: Soldier): Soldier {
    const current = data.soldiers.find(
      (candidate) => candidate.personalNumber === soldier.personalNumber,
    );
    if (!current) throw new Error("החייל השתנה או אינו קיים עוד.");
    return current;
  }

  private movementRequest(
    data: CompanyData,
    draft: MovementDraft,
    timestamp = new Date().toISOString(),
  ) {
    return appendRow(this.sheetId(data, "movements"), [
      timestamp,
      draft.action,
      draft.method || "",
      draft.type || "",
      draft.variant || "",
      draft.number || "",
      draft.quantity || 0,
      draft.previousSoldier || "",
      draft.newSoldier || "",
      data.meta.userEmail,
      draft.note || "",
    ]);
  }

  private holdingWriteRequest(
    data: CompanyData,
    current: QuantityHolding | undefined,
    personalNumber: string,
    item: CatalogItem,
    quantity: number,
  ) {
    const values: CellPrimitive[] = [
      personalNumber,
      item.type,
      item.variant,
      quantity,
    ];
    return current
      ? updateRow(this.sheetId(data, "holdings"), current.row, values)
      : appendRow(this.sheetId(data, "holdings"), values);
  }

  private sheetId(data: CompanyData, key: keyof typeof SHEET_SCHEMAS): number {
    const title = SHEET_SCHEMAS[key].title;
    const sheet = data.meta.sheets.find(
      (candidate) => candidate.title === title,
    );
    if (!sheet) throw new Error(`חסרה לשונית ${title}.`);
    return sheet.id;
  }

  private ensureEditable(data: CompanyData) {
    if (!data.meta.editable) throw new Error("הגיליון פתוח לקריאה בלבד.");
  }

  private access(data: CompanyData) {
    return resolveUserAccess(data.meta.userEmail, data.permissions);
  }

  private ensureAdmin(data: CompanyData) {
    if (!this.access(data).admin)
      throw new Error("הפעולה זמינה למנהלים בלבד.");
  }

  private ensureAllPlatoons(data: CompanyData) {
    if (!hasAllPlatoons(this.access(data)))
      throw new Error("הפעולה אינה זמינה למשתמש המוגבל למחלקות מסוימות.");
  }

  private ensureMethodAccess(
    data: CompanyData,
    method: "צל״מ" | "כמותי",
  ) {
    if (!canAccessMethod(this.access(data), method))
      throw new Error("אין הרשאה לטפל בסוג הציוד הזה.");
  }

  private ensurePlatoonAccess(data: CompanyData, platoon: string) {
    const access = this.access(data);
    if (!access.admin && access.platoons.length && !access.platoons.includes(platoon))
      throw new Error("אין הרשאה לטפל במחלקה הזאת.");
  }

  private ensureSoldierAccess(data: CompanyData, soldier: Soldier) {
    if (!canAccessSoldier(this.access(data), soldier))
      throw new Error("אין הרשאה לטפל בחייל מהמחלקה הזאת.");
  }

  private ensurePersonalNumberAccess(
    data: CompanyData,
    personalNumber: string,
  ) {
    if (
      personalNumber &&
      !canAccessPersonalNumber(this.access(data), personalNumber, data)
    )
      throw new Error("אין הרשאה לצפות או לטפל ברשומה הזאת.");
  }

  private ensurePositiveQuantity(quantity: number) {
    if (!Number.isInteger(quantity) || quantity <= 0)
      throw new Error("הכמות חייבת להיות מספר שלם וחיובי.");
  }

  private headerFormatRequest(
    sheetId: number,
    startColumnIndex: number,
    endColumnIndex: number,
  ) {
    return {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex,
          endColumnIndex,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.086, green: 0.412, blue: 0.478 },
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    };
  }

  private async writeInitialSheets() {
    await this.valuesBatchUpdate(
      Object.values(SHEET_SCHEMAS).map((schema) => ({
        range: `${quoteSheet(schema.title)}!A1`,
        values: [[...schema.headers]],
      })),
    );
    await this.valuesBatchUpdate([
      {
        range: `${quoteSheet(SHEET_SCHEMAS.settings.title)}!A2`,
        values: [
          ["", "write_mode", "coordinated"],
          ["", "schema_version", SCHEMA_VERSION],
        ],
      },
    ]);
    const spreadsheet = await this.getSpreadsheet();
    const requests = (spreadsheet.sheets || [])
      .filter((sheet: any) =>
        Object.values(SHEET_SCHEMAS).some(
          (schema) => schema.title === sheet.properties.title,
        ),
      )
      .flatMap((sheet: any) => [
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheet.properties.sheetId,
              rightToLeft: true,
            },
            fields: "rightToLeft",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheet.properties.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.086, green: 0.412, blue: 0.478 },
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                },
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          },
        },
        {
          setBasicFilter: {
            filter: {
              range: {
                sheetId: sheet.properties.sheetId,
                startRowIndex: 0,
                startColumnIndex: 0,
              },
            },
          },
        },
      ]);
    await this.batch(requests);
  }

  private async readAllVisibleSheets(titles: string[]): Promise<SheetRows> {
    const entries = await Promise.all(
      titles.map(async (title) => {
        if (title === SHEET_SCHEMAS.signatures.title) {
          const response = resultOf(
            await gapi.client.sheets.spreadsheets.values.batchGet({
              spreadsheetId: this.spreadsheetId,
              ranges: [
                `${quoteSheet(title)}!A1:G1`,
                `${quoteSheet(title)}!A2:D`,
                `${quoteSheet(title)}!G2:G`,
              ],
              valueRenderOption: "UNFORMATTED_VALUE",
            }),
          );
          const ranges = response?.valueRanges ?? [];
          const header = ranges[0]?.values?.[0] ?? [];
          const details: unknown[][] = ranges[1]?.values ?? [];
          const versions: unknown[][] = ranges[2]?.values ?? [];
          const rowCount = Math.max(details.length, versions.length);
          const indexRows = Array.from({ length: rowCount }, (_, index) => {
            const detail = details[index] ?? [];
            return [
              detail[0] ?? "",
              detail[1] ?? "",
              detail[2] ?? "",
              detail[3] ?? "",
              "",
              "",
              versions[index]?.[0] ?? "",
            ];
          });
          return [
            title,
            header.length ? [header, ...indexRows] : indexRows,
          ] as const;
        }
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: quoteSheet(title),
          valueRenderOption: "UNFORMATTED_VALUE",
        });
        return [title, asRows(response)] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  private async getSpreadsheet(): Promise<any> {
    return resultOf(
      await gapi.client.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
        fields:
          "properties(title),sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))",
      }),
    );
  }

  private async getUserProfile(): Promise<{ email: string; name: string }> {
    try {
      const user = resultOf(
        await gapi.client.drive.about.get({
          fields: "user(emailAddress,displayName)",
        }),
      )?.user;
      return { email: user?.emailAddress || "", name: user?.displayName || "" };
    } catch {
      return { email: "", name: "" };
    }
  }

  private async getEditability(): Promise<boolean> {
    try {
      return Boolean(
        resultOf(
          await gapi.client.drive.files.get({
            fileId: this.spreadsheetId,
            fields: "capabilities(canEdit)",
          }),
        )?.capabilities?.canEdit,
      );
    } catch {
      return false;
    }
  }

  private async valuesBatchUpdate(
    data: Array<{ range: string; values: CellPrimitive[][] }>,
  ) {
    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      resource: { valueInputOption: "RAW", data },
    });
  }

  private async batch(requests: any[]): Promise<void> {
    if (!requests.length) return;
    const data = this.latestData;
    if (data?.settings.writeMode === "direct") {
      const requestKey = this.newRequestKey();
      await this.directBatch(this.addRequestKey(requests, data, requestKey));
      return;
    }
    if (data && APPS_SCRIPT_DEPLOYMENT_ID) {
      const fingerprint = this.mutationFingerprint(requests, data);
      const requestKey =
        this.pendingRequestKeys.get(fingerprint) ||
        this.newRequestKey();
      this.pendingRequestKeys.set(fingerprint, requestKey);
      const enriched = this.addRequestKey(requests, data, requestKey);
      const baseRows = Object.fromEntries(
        CONCURRENCY_SHEETS.map((key) => {
          const title = SHEET_SCHEMAS[key].title;
          return [title, data.sourceRows?.[title] || []];
        }),
      );
      const response = await (gapi.client as any).script.scripts.run({
        scriptId: APPS_SCRIPT_DEPLOYMENT_ID,
        resource: {
          function: "applyMutation",
          parameters: [
            {
              spreadsheetId: this.spreadsheetId,
              requestKey,
              expectedActor: data.meta.userEmail,
              baseRows,
              requests: enriched,
            },
          ],
        },
      });
      const apiResult = resultOf(response);
      const executionError = apiResult?.error?.details?.[0]?.errorMessage;
      if (executionError) throw new Error("שירות השמירה המתואמת נכשל.");
      const result = apiResult?.response?.result as CoordinatorResult | undefined;
      if (!result?.ok) {
        this.pendingRequestKeys.delete(fingerprint);
        throw new Error(result?.message || "השמירה המתואמת נכשלה.");
      }
      this.pendingRequestKeys.delete(fingerprint);
      if (result.rebased)
        this.concurrencyNotice =
          "הנתונים השתנו במקביל. הפעולה הותאמה למצב העדכני ונשמרה.";
      return;
    }
    if (!data) {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: { requests },
      });
      return;
    }
    if (import.meta.env.PROD)
      throw new Error(
        "שירות השמירה המתואמת אינו מוגדר. יש להגדיר VITE_APPS_SCRIPT_DEPLOYMENT_ID.",
      );
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      resource: { requests },
    });
  }

  private async directBatch(requests: any[]): Promise<void> {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      resource: { requests },
    });
  }

  private newRequestKey(): string {
    return (
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  }

  private addRequestKey(
    requests: any[],
    data: CompanyData,
    requestKey: string,
  ): any[] {
    const movementSheetId = this.sheetId(data, "movements");
    return requests.map((request) => {
      if (request?.appendCells?.sheetId !== movementSheetId) return request;
      return {
        ...request,
        appendCells: {
          ...request.appendCells,
          rows: (request.appendCells.rows || []).map((row: any) => ({
            ...row,
            values: [...(row.values || []), cell(requestKey)],
          })),
        },
      };
    });
  }

  private mutationFingerprint(requests: any[], data: CompanyData): string {
    const movementSheetId = this.sheetId(data, "movements");
    const signatureSheetId = this.sheetId(data, "signatures");
    const normalized = JSON.parse(JSON.stringify(requests));
    normalized.forEach((request: any) => {
      const append = request?.appendCells;
      if (
        append?.sheetId !== movementSheetId &&
        append?.sheetId !== signatureSheetId
      )
        return;
      (append.rows || []).forEach((row: any) => {
        if (row.values?.[0]) row.values[0] = cell("");
      });
    });
    return JSON.stringify(normalized);
  }
}
