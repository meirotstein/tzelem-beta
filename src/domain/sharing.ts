import { CompanyData, Equipment, Soldier } from './types';
import { equipmentForSoldier } from './rules';

export interface SoldierShareFilters {
  query: string;
  platoon: string;
  equipmentState: string;
  showArchived: boolean;
}

export interface EquipmentShareFilters {
  query: string;
  type: string;
  status: string;
  platoon: string;
  showArchived: boolean;
}

function filterSummary(parts: string[]): string {
  return parts.length ? `_סינון: ${parts.join(' · ')}_` : '_ללא סינון_';
}

function soldierFilterSummary(filters: SoldierShareFilters): string {
  const parts: string[] = [];
  if (filters.query.trim()) parts.push(`חיפוש: ${filters.query.trim()}`);
  if (filters.platoon) parts.push(`מחלקה ${filters.platoon}`);
  if (filters.equipmentState === 'assigned') parts.push('עם צל״ם');
  if (filters.equipmentState === 'none') parts.push('ללא צל״ם');
  if (filters.showArchived) parts.push('כולל ארכיון');
  return filterSummary(parts);
}

function equipmentFilterSummary(filters: EquipmentShareFilters): string {
  const parts: string[] = [];
  if (filters.query.trim()) parts.push(`חיפוש: ${filters.query.trim()}`);
  if (filters.type) parts.push(`סוג: ${filters.type}`);
  if (filters.status) parts.push(`סטטוס: ${filters.status}`);
  if (filters.platoon) parts.push(`מחלקה ${filters.platoon}`);
  if (filters.showArchived) parts.push('כולל ארכיון');
  return filterSummary(parts);
}

export function buildSoldiersWhatsAppMessage(
  data: CompanyData,
  soldiers: Soldier[],
  filters: SoldierShareFilters,
): string {
  const lines = [
    '*רשימת חיילים וצל״ם*',
    soldierFilterSummary(filters),
    `סה״כ חיילים: ${soldiers.length}`,
    '',
  ];
  const platoons = [...new Set(soldiers.map((soldier) => soldier.platoon))].sort((a, b) => a.localeCompare(b, 'he'));
  for (const platoon of platoons) {
    lines.push(`*[מחלקה ${platoon}]*`, '');
    for (const soldier of soldiers.filter((candidate) => candidate.platoon === platoon)) {
      lines.push(`*${soldier.name}*${soldier.active ? '' : ' [בארכיון]'}`);
      const items = equipmentForSoldier(data, soldier.personalNumber);
      if (items.length) {
        items.forEach((item) => lines.push(`• ${item.type} — ${item.number}`));
      } else {
        lines.push('• ללא צל״ם משויך');
      }
      lines.push('');
    }
  }
  return lines.join('\n').trim();
}

export function buildEquipmentWhatsAppMessage(
  data: CompanyData,
  equipment: Equipment[],
  filters: EquipmentShareFilters,
): string {
  const lines = [
    '*מלאי צל״ם*',
    equipmentFilterSummary(filters),
    `סה״כ פריטים: ${equipment.length}`,
    '',
  ];
  const types = [...new Set(equipment.map((item) => item.type))].sort((a, b) => a.localeCompare(b, 'he'));
  for (const type of types) {
    lines.push(`*[${type}]*`, '');
    for (const item of equipment.filter((candidate) => candidate.type === type)) {
      const holder = data.soldiers.find((soldier) => soldier.personalNumber === item.assignedTo);
      const assignment = holder ? `${holder.name} (מחלקה ${holder.platoon})` : 'לא משויך';
      lines.push(`• ${item.number} — ${assignment} · ${item.status}${item.active ? '' : ' · בארכיון'}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function shareOnWhatsApp(message: string): void {
  window.location.href = `whatsapp://send?text=${encodeURIComponent(message)}`;
}
