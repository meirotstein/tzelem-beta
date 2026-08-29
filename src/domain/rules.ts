import { CompanyData, Equipment, EquipmentStatus, SoldierInput } from './types';
import { equipmentKey, normalizeText } from './schema';

export function validateSoldierInput(input: SoldierInput, data: CompanyData, editingRow?: number): string {
  if (!normalizeText(input.name)) return 'יש להזין שם חייל';
  if (!normalizeText(input.personalNumber)) return 'יש להזין מספר אישי';
  if (!normalizeText(input.platoon)) return 'יש לבחור מחלקה';
  if (data.soldiers.some((soldier) => soldier.row !== editingRow && soldier.personalNumber === normalizeText(input.personalNumber))) {
    return 'המספר האישי כבר קיים';
  }
  return '';
}

export function validateEquipmentIdentity(
  type: string,
  number: string,
  data: CompanyData,
  editingRow?: number,
): string {
  if (!normalizeText(type)) return 'יש לבחור סוג צל״ם';
  if (!normalizeText(number)) return 'יש להזין מספר צ';
  const key = equipmentKey(type, number);
  if (data.equipment.some((item) => item.row !== editingRow && equipmentKey(item.type, item.number) === key)) {
    return 'מספר הצ כבר קיים בסוג הזה';
  }
  return '';
}

export function validateStatusChange(item: Equipment, status: EquipmentStatus, note: string): string {
  if (item.assignedTo && status !== 'משויך') return 'יש להחזיר את הציוד לפני שינוי הסטטוס';
  if (!item.assignedTo && status === 'משויך') return 'סטטוס משויך נקבע באמצעות שיוך לחייל';
  if (['אבוד', 'תקול', 'מושבת'].includes(status) && !normalizeText(note)) return 'נדרשת הערה עבור סטטוס זה';
  return '';
}

export function canArchiveSoldier(personalNumber: string, data: CompanyData): boolean {
  return !data.equipment.some((item) => item.active && item.assignedTo === personalNumber);
}

export function canArchiveEquipment(item: Equipment): boolean {
  return !item.assignedTo;
}

export function activeSoldierFor(data: CompanyData, personalNumber: string) {
  return data.soldiers.find((soldier) => soldier.personalNumber === personalNumber && soldier.active);
}

export function equipmentForSoldier(data: CompanyData, personalNumber: string): Equipment[] {
  return data.equipment.filter((item) => item.active && item.assignedTo === personalNumber);
}

export function soldiersWithoutEquipment(data: CompanyData): number {
  const assigned = new Set(data.equipment.filter((item) => item.active && item.assignedTo).map((item) => item.assignedTo));
  return data.soldiers.filter((soldier) => soldier.active && !assigned.has(soldier.personalNumber)).length;
}
