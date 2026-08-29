import {
  CompanyData,
  Equipment,
  EquipmentInput,
  EquipmentStatus,
  HistoryDraft,
  HistoryEntry,
  LoadResult,
  ManagedSettings,
  Soldier,
  SoldierInput,
  SpreadsheetMeta,
} from '../domain/types';
import {
  equipmentKey,
  isEquipmentStatus,
  isWorkbookEmpty,
  normalizeText,
  parseActive,
  REQUIRED_SHEETS,
  SHEET_SCHEMA,
  validateHeaders,
} from '../domain/schema';
import { validateEquipmentIdentity, validateSoldierInput, validateStatusChange } from '../domain/rules';

type CellPrimitive = string | number | boolean;
type SheetRows = Record<string, unknown[][]>;

function resultOf(response: any): any {
  if (response?.result) return response.result;
  if (response?.body) return JSON.parse(response.body);
  return response;
}

function quoteSheet(title: string): string {
  return `'${title.replaceAll("'", "''")}'`;
}

function cell(value: CellPrimitive) {
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  if (typeof value === 'number') return { userEnteredValue: { numberValue: value } };
  return { userEnteredValue: { stringValue: value } };
}

function rowData(values: CellPrimitive[]) {
  return { values: values.map(cell) };
}

function updateRow(sheetId: number, row: number, values: CellPrimitive[]) {
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex: row - 1,
        endRowIndex: row,
        startColumnIndex: 0,
        endColumnIndex: values.length,
      },
      rows: [rowData(values)],
      fields: 'userEnteredValue',
    },
  };
}

function appendRow(sheetId: number, values: CellPrimitive[]) {
  return { appendCells: { sheetId, rows: [rowData(values)], fields: 'userEnteredValue' } };
}

function asRows(response: any): unknown[][] {
  return resultOf(response)?.values || [];
}

export class SpreadsheetRepository {
  constructor(private readonly spreadsheetId: string) {}

  async inspect(): Promise<LoadResult> {
    const [spreadsheet, user, editable] = await Promise.all([
      this.getSpreadsheet(),
      this.getUserProfile(),
      this.getEditability(),
    ]);
    const sheets = spreadsheet.sheets || [];
    const titles = sheets.map((sheet: any) => String(sheet.properties.title));
    const sheetIds = Object.fromEntries(
      sheets.map((sheet: any) => [String(sheet.properties.title), Number(sheet.properties.sheetId)]),
    );
    const rows = await this.readAllVisibleSheets(titles);
    const meta: SpreadsheetMeta = {
      spreadsheetId: this.spreadsheetId,
      title: spreadsheet.properties?.title || this.spreadsheetId,
      userEmail: user.email,
      userName: user.name,
      isReadOnly: !editable,
      sheetIds,
    };

    if (isWorkbookEmpty(rows)) return { kind: 'empty', meta };
    const issues = validateHeaders(rows);
    if (issues.length) return { kind: 'incompatible', meta, issues };

    return { kind: 'ready', data: this.parseData(meta, rows) };
  }

  async initializeEmptyWorkbook(meta: SpreadsheetMeta): Promise<void> {
    if (meta.isReadOnly) throw new Error('read_only');
    const current = await this.inspect();
    if (current.kind !== 'empty') throw new Error('spreadsheet_not_empty');
    meta = current.meta;

    const existing = Object.keys(meta.sheetIds);
    const requests: any[] = [];
    const unusedFirst = existing.find((title) => !REQUIRED_SHEETS.some((sheet) => sheet.title === title));
    const missing = REQUIRED_SHEETS.filter((sheet) => meta.sheetIds[sheet.title] === undefined);

    if (unusedFirst && missing.length) {
      const first = missing.shift()!;
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: meta.sheetIds[unusedFirst], title: first.title, rightToLeft: true },
          fields: 'title,rightToLeft',
        },
      });
    }
    for (const sheet of missing) {
      requests.push({ addSheet: { properties: { title: sheet.title, rightToLeft: true } } });
    }
    for (const sheet of REQUIRED_SHEETS.filter((sheet) => meta.sheetIds[sheet.title] !== undefined)) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: meta.sheetIds[sheet.title], rightToLeft: true },
          fields: 'rightToLeft',
        },
      });
    }
    if (requests.length) await this.batch(requests);

    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      resource: {
        valueInputOption: 'RAW',
        data: REQUIRED_SHEETS.map((sheet) => ({
          range: `${quoteSheet(sheet.title)}!A1:${String.fromCharCode(64 + sheet.headers.length)}1`,
          values: [[...sheet.headers]],
        })),
      },
    });

    const refreshed = resultOf(await this.getSpreadsheet());
    const formatting = (refreshed.sheets || [])
      .filter((sheet: any) => REQUIRED_SHEETS.some((required) => required.title === sheet.properties.title))
      .map((sheet: any) => ({
        repeatCell: {
          range: { sheetId: sheet.properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.086, green: 0.412, blue: 0.478 },
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      }));
    if (formatting.length) await this.batch(formatting);
  }

  async addSoldier(data: CompanyData, input: SoldierInput): Promise<void> {
    const error = validateSoldierInput(input, data);
    if (error) throw new Error(error);
    await this.batch([
      appendRow(data.meta.sheetIds[SHEET_SCHEMA.soldiers.title], [input.name.trim(), input.personalNumber.trim(), input.platoon.trim(), true]),
      this.historyRequest(data, { action: 'הוספת חייל', newSoldier: input.personalNumber.trim(), note: input.name.trim() }),
    ]);
  }

  async editSoldier(data: CompanyData, soldier: Soldier, input: SoldierInput): Promise<void> {
    if (input.personalNumber.trim() !== soldier.personalNumber) throw new Error('לא ניתן לשנות מספר אישי לאחר יצירת החייל');
    const error = validateSoldierInput(input, data, soldier.row);
    if (error) throw new Error(error);
    const personalNumber = input.personalNumber.trim();
    const requests: any[] = [
      updateRow(data.meta.sheetIds[SHEET_SCHEMA.soldiers.title], soldier.row, [input.name.trim(), personalNumber, input.platoon.trim(), soldier.active]),
    ];
    requests.push(this.historyRequest(data, {
      action: 'עריכת חייל',
      previousSoldier: soldier.personalNumber,
      newSoldier: personalNumber,
      note: `${soldier.name} ← ${input.name.trim()}`,
    }));
    await this.batch(requests);
  }

  async setSoldierActive(data: CompanyData, soldier: Soldier, active: boolean): Promise<void> {
    await this.batch([
      updateRow(data.meta.sheetIds[SHEET_SCHEMA.soldiers.title], soldier.row, [soldier.name, soldier.personalNumber, soldier.platoon, active]),
      this.historyRequest(data, {
        action: active ? 'הפעלת חייל' : 'ארכוב חייל',
        newSoldier: soldier.personalNumber,
        note: soldier.name,
      }),
    ]);
  }

  async addEquipment(data: CompanyData, input: EquipmentInput): Promise<void> {
    const error = validateEquipmentIdentity(input.type, input.number, data);
    if (error) throw new Error(error);
    await this.batch([
      appendRow(data.meta.sheetIds[SHEET_SCHEMA.equipment.title], [input.type.trim(), input.number.trim(), 'זמין', '', input.note.trim(), true]),
      this.historyRequest(data, { action: 'הוספת צל״ם', type: input.type.trim(), number: input.number.trim(), note: input.note.trim() }),
    ]);
  }

  async editEquipment(data: CompanyData, item: Equipment, input: EquipmentInput): Promise<void> {
    if (equipmentKey(input.type, input.number) !== equipmentKey(item.type, item.number)) {
      throw new Error('לא ניתן לשנות סוג או מספר צ לאחר יצירת הפריט');
    }
    const error = validateEquipmentIdentity(input.type, input.number, data, item.row);
    if (error) throw new Error(error);
    const type = input.type.trim();
    const number = input.number.trim();
    await this.batch([
      updateRow(data.meta.sheetIds[SHEET_SCHEMA.equipment.title], item.row, [type, number, item.status, item.assignedTo, input.note.trim(), item.active]),
      this.historyRequest(data, {
        action: 'עריכת צל״ם',
        type,
        number,
        previousSoldier: item.assignedTo,
        newSoldier: item.assignedTo,
        note: `${item.type} ${item.number} ← ${type} ${number}${input.note.trim() ? ` · ${input.note.trim()}` : ''}`,
      }),
    ]);
  }

  async setEquipmentActive(data: CompanyData, item: Equipment, active: boolean): Promise<void> {
    await this.batch([
      updateRow(data.meta.sheetIds[SHEET_SCHEMA.equipment.title], item.row, [item.type, item.number, item.status, item.assignedTo, item.note, active]),
      this.historyRequest(data, {
        action: active ? 'הפעלת צל״ם' : 'ארכוב צל״ם',
        type: item.type,
        number: item.number,
        previousSoldier: item.assignedTo,
        newSoldier: item.assignedTo,
      }),
    ]);
  }

  async assign(data: CompanyData, item: Equipment, soldier: Soldier, note: string): Promise<void> {
    if (!item.active || !soldier.active) throw new Error('לא ניתן לשייך רשומה לא פעילה');
    if (!item.assignedTo && item.status !== 'זמין') throw new Error('ניתן לשייך רק ציוד זמין');
    if (item.assignedTo === soldier.personalNumber) throw new Error('הציוד כבר משויך לחייל זה');
    await this.batch([
      updateRow(data.meta.sheetIds[SHEET_SCHEMA.equipment.title], item.row, [item.type, item.number, 'משויך', soldier.personalNumber, item.note, item.active]),
      this.historyRequest(data, {
        action: item.assignedTo ? 'העברה' : 'שיוך',
        type: item.type,
        number: item.number,
        previousSoldier: item.assignedTo,
        newSoldier: soldier.personalNumber,
        note: note.trim(),
      }),
    ]);
  }

  async returnEquipment(data: CompanyData, item: Equipment, note: string): Promise<void> {
    if (!item.assignedTo) throw new Error('הציוד אינו משויך');
    await this.batch([
      updateRow(data.meta.sheetIds[SHEET_SCHEMA.equipment.title], item.row, [item.type, item.number, 'זמין', '', item.note, item.active]),
      this.historyRequest(data, {
        action: 'החזרה',
        type: item.type,
        number: item.number,
        previousSoldier: item.assignedTo,
        note: note.trim(),
      }),
    ]);
  }

  async changeEquipmentStatus(data: CompanyData, item: Equipment, status: EquipmentStatus, note: string): Promise<void> {
    const error = validateStatusChange(item, status, note);
    if (error) throw new Error(error);
    await this.batch([
      updateRow(data.meta.sheetIds[SHEET_SCHEMA.equipment.title], item.row, [item.type, item.number, status, item.assignedTo, note.trim() || item.note, item.active]),
      this.historyRequest(data, {
        action: 'שינוי סטטוס',
        type: item.type,
        number: item.number,
        previousSoldier: item.assignedTo,
        newSoldier: item.assignedTo,
        note: `${item.status} ← ${status}${note.trim() ? ` · ${note.trim()}` : ''}`,
      }),
    ]);
  }

  async saveSettings(data: CompanyData, settings: ManagedSettings, action: string, note: string): Promise<void> {
    const rowCount = Math.max(data.settings.equipmentTypes.length, data.settings.platoons.length, settings.equipmentTypes.length, settings.platoons.length) + 1;
    const rows: CellPrimitive[][] = [
      [...SHEET_SCHEMA.settings.headers],
      ...Array.from({ length: rowCount - 1 }, (_, index) => [settings.equipmentTypes[index] || '', settings.platoons[index] || '']),
    ];
    await this.batch([
      {
        updateCells: {
          range: {
            sheetId: data.meta.sheetIds[SHEET_SCHEMA.settings.title],
            startRowIndex: 0,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: 2,
          },
          rows: rows.map(rowData),
          fields: 'userEnteredValue',
        },
      },
      this.historyRequest(data, { action, note }),
    ]);
  }

  private parseData(meta: SpreadsheetMeta, rows: SheetRows): CompanyData {
    const soldiers: Soldier[] = (rows[SHEET_SCHEMA.soldiers.title] || []).slice(1)
      .map((row, index) => ({
        row: index + 2,
        name: normalizeText(row[0]),
        personalNumber: normalizeText(row[1]),
        platoon: normalizeText(row[2]),
        active: parseActive(row[3]),
      }))
      .filter((soldier) => soldier.name || soldier.personalNumber);

    const equipment: Equipment[] = (rows[SHEET_SCHEMA.equipment.title] || []).slice(1)
      .map((row, index) => {
        const rawStatus = normalizeText(row[2]) || 'זמין';
        if (!isEquipmentStatus(rawStatus)) throw new Error(`סטטוס צל״ם לא מוכר בשורה ${index + 2}`);
        return {
          row: index + 2,
          type: normalizeText(row[0]),
          number: normalizeText(row[1]),
          status: rawStatus,
          assignedTo: normalizeText(row[3]),
          note: normalizeText(row[4]),
          active: parseActive(row[5]),
        };
      })
      .filter((item) => item.type || item.number);

    const soldierKeys = new Set<string>();
    for (const soldier of soldiers) {
      if (!soldier.name || !soldier.personalNumber || !soldier.platoon) throw new Error(`פרטי חייל חסרים בשורה ${soldier.row}`);
      if (soldierKeys.has(soldier.personalNumber)) throw new Error(`מספר אישי כפול: ${soldier.personalNumber}`);
      soldierKeys.add(soldier.personalNumber);
    }
    const equipmentKeys = new Set<string>();
    for (const item of equipment) {
      const key = equipmentKey(item.type, item.number);
      if (!item.type || !item.number) throw new Error(`פרטי צל״ם חסרים בשורה ${item.row}`);
      if (equipmentKeys.has(key)) throw new Error(`מספר צ כפול בסוג ${item.type}: ${item.number}`);
      if (item.assignedTo && item.status !== 'משויך') throw new Error(`שיוך וסטטוס אינם תואמים בשורת צל״ם ${item.row}`);
      if (!item.assignedTo && item.status === 'משויך') throw new Error(`חסר חייל משויך בשורת צל״ם ${item.row}`);
      if (item.assignedTo && !soldierKeys.has(item.assignedTo)) throw new Error(`מספר אישי משויך לא קיים בשורת צל״ם ${item.row}`);
      equipmentKeys.add(key);
    }

    const history: HistoryEntry[] = (rows[SHEET_SCHEMA.history.title] || []).slice(1)
      .map((row, index) => ({
        row: index + 2,
        timestamp: normalizeText(row[0]),
        action: normalizeText(row[1]),
        type: normalizeText(row[2]),
        number: normalizeText(row[3]),
        previousSoldier: normalizeText(row[4]),
        newSoldier: normalizeText(row[5]),
        actor: normalizeText(row[6]),
        note: normalizeText(row[7]),
      }))
      .filter((entry) => entry.timestamp || entry.action);

    const settingRows = (rows[SHEET_SCHEMA.settings.title] || []).slice(1);
    const settings: ManagedSettings = {
      equipmentTypes: [...new Set(settingRows.map((row) => normalizeText(row[0])).filter(Boolean))],
      platoons: [...new Set(settingRows.map((row) => normalizeText(row[1])).filter(Boolean))],
    };
    return { meta, soldiers, equipment, history, settings };
  }

  private historyRequest(data: CompanyData, draft: HistoryDraft) {
    return appendRow(data.meta.sheetIds[SHEET_SCHEMA.history.title], [
      new Date().toISOString(),
      draft.action,
      draft.type || '',
      draft.number || '',
      draft.previousSoldier || '',
      draft.newSoldier || '',
      data.meta.userEmail,
      draft.note || '',
    ]);
  }

  private async readAllVisibleSheets(titles: string[]): Promise<SheetRows> {
    const entries = await Promise.all(
      titles.map(async (title) => {
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: quoteSheet(title),
          valueRenderOption: 'UNFORMATTED_VALUE',
        });
        return [title, asRows(response)] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  private async getSpreadsheet(): Promise<any> {
    const response = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'properties(title),sheets(properties(sheetId,title,hidden))',
    });
    return resultOf(response);
  }

  private async getUserProfile(): Promise<{ email: string; name: string }> {
    try {
      const response = await gapi.client.drive.about.get({ fields: 'user(emailAddress,displayName)' });
      const user = resultOf(response)?.user;
      return { email: user?.emailAddress || '', name: user?.displayName || '' };
    } catch {
      return { email: '', name: '' };
    }
  }

  private async getEditability(): Promise<boolean> {
    try {
      const response = await gapi.client.drive.files.get({
        fileId: this.spreadsheetId,
        fields: 'capabilities(canEdit)',
      });
      return Boolean(resultOf(response)?.capabilities?.canEdit);
    } catch {
      return false;
    }
  }

  private async batch(requests: any[]): Promise<void> {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      resource: { requests },
    });
  }
}
