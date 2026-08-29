import { CompatibilityIssue, EquipmentStatus } from './types';

export const SHEET_SCHEMA = {
  soldiers: { title: 'חיילים', headers: ['שם', 'מספר אישי', 'מחלקה', 'פעיל'] },
  equipment: { title: 'צלם', headers: ['סוג', 'מספר צ', 'סטטוס', 'מספר אישי משויך', 'הערה', 'פעיל'] },
  history: {
    title: 'שיוכים',
    headers: ['חותמת זמן', 'פעולה', 'סוג', 'מספר צ', 'מספר אישי קודם', 'מספר אישי חדש', 'מבצע הפעולה', 'הערה'],
  },
  settings: { title: 'הגדרות', headers: ['סוגי צלם', 'מחלקות'] },
} as const;

export const REQUIRED_SHEETS = Object.values(SHEET_SCHEMA);

export function normalizeText(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

export function parseActive(value: unknown): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return !['false', '0', 'לא', 'לא פעיל'].includes(normalized);
}

export function activeCell(active: boolean): string {
  return active ? 'TRUE' : 'FALSE';
}

export function equipmentKey(type: string, number: string): string {
  return `${normalizeText(type)}::${normalizeText(number)}`;
}

export function isEquipmentStatus(value: string): value is EquipmentStatus {
  return ['זמין', 'משויך', 'תקול', 'אבוד', 'בתיקון', 'מושבת'].includes(value);
}

export function validateHeaders(sheetRows: Record<string, unknown[][]>): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = [];
  for (const sheet of REQUIRED_SHEETS) {
    const rows = sheetRows[sheet.title];
    if (!rows) {
      issues.push({ tab: sheet.title, message: `הלשונית „${sheet.title}” חסרה` });
      continue;
    }
    const actual = rows[0] || [];
    const bad = sheet.headers.findIndex((header, index) => normalizeText(actual[index]) !== header);
    if (bad !== -1) {
      issues.push({
        tab: sheet.title,
        message: `כותרת ${bad + 1} צריכה להיות „${sheet.headers[bad]}”`,
      });
    }
  }
  return issues;
}

export function isWorkbookEmpty(sheetRows: Record<string, unknown[][]>): boolean {
  return Object.values(sheetRows).every((rows) =>
    rows.every((row) => row.every((cell) => normalizeText(cell) === '')),
  );
}
