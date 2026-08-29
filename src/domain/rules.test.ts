import { describe, expect, it } from 'vitest';
import {
  canArchiveEquipment,
  canArchiveSoldier,
  soldiersWithoutEquipment,
  validateEquipmentIdentity,
  validateSoldierInput,
  validateStatusChange,
} from './rules';
import { isWorkbookEmpty, validateHeaders } from './schema';
import { CompanyData, Equipment } from './types';

const item: Equipment = {
  row: 2,
  type: 'נשק',
  number: '123',
  status: 'משויך',
  assignedTo: '1',
  note: '',
  active: true,
};

describe('spreadsheet compatibility', () => {
  it('distinguishes a truly empty workbook', () => {
    expect(isWorkbookEmpty({ Sheet1: [] })).toBe(true);
    expect(isWorkbookEmpty({ Sheet1: [['data']] })).toBe(false);
  });

  it('reports missing required tabs', () => {
    expect(validateHeaders({ חיילים: [['שם', 'מספר אישי', 'מחלקה', 'פעיל']] })).toHaveLength(3);
  });

  it('reports an incorrect header without treating the workbook as empty', () => {
    const rows = {
      חיילים: [['שם שגוי', 'מספר אישי', 'מחלקה', 'פעיל']],
      צלם: [['סוג', 'מספר צ', 'סטטוס', 'מספר אישי משויך', 'הערה', 'פעיל']],
      שיוכים: [['חותמת זמן', 'פעולה', 'סוג', 'מספר צ', 'מספר אישי קודם', 'מספר אישי חדש', 'מבצע הפעולה', 'הערה']],
      הגדרות: [['סוגי צלם', 'מחלקות']],
    };
    expect(isWorkbookEmpty(rows)).toBe(false);
    expect(validateHeaders(rows)).toEqual([{ tab: 'חיילים', message: 'כותרת 1 צריכה להיות „שם”' }]);
  });
});

describe('domain invariants', () => {
  it('requires return before changing an assigned item status', () => {
    expect(validateStatusChange(item, 'תקול', 'בעיה')).toContain('להחזיר');
    expect(canArchiveEquipment(item)).toBe(false);
  });

  it('requires a note for a faulty unassigned item', () => {
    expect(validateStatusChange({ ...item, status: 'זמין', assignedTo: '' }, 'תקול', '')).toContain('נדרשת הערה');
  });

  it('counts active soldiers without active equipment', () => {
    const data = {
      soldiers: [
        { row: 2, name: 'א', personalNumber: '1', platoon: '1', active: true },
        { row: 3, name: 'ב', personalNumber: '2', platoon: '1', active: true },
      ],
      equipment: [item],
    } as CompanyData;
    expect(soldiersWithoutEquipment(data)).toBe(1);
    expect(canArchiveSoldier('1', data)).toBe(false);
    expect(canArchiveSoldier('2', data)).toBe(true);
  });

  it('enforces natural-key uniqueness while allowing the same number in another type', () => {
    const data = {
      soldiers: [{ row: 2, name: 'א', personalNumber: '1', platoon: '1', active: true }],
      equipment: [item],
    } as CompanyData;
    expect(validateSoldierInput({ name: 'ב', personalNumber: '1', platoon: '1' }, data)).toContain('כבר קיים');
    expect(validateEquipmentIdentity('נשק', '123', data)).toContain('כבר קיים');
    expect(validateEquipmentIdentity('משקפת', '123', data)).toBe('');
  });
});
