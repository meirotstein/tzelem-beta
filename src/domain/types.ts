export const EQUIPMENT_STATUSES = ['זמין', 'משויך', 'תקול', 'אבוד', 'בתיקון', 'מושבת'] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export interface Soldier {
  row: number;
  name: string;
  personalNumber: string;
  platoon: string;
  active: boolean;
}

export interface Equipment {
  row: number;
  type: string;
  number: string;
  status: EquipmentStatus;
  assignedTo: string;
  note: string;
  active: boolean;
}

export interface HistoryEntry {
  row: number;
  timestamp: string;
  action: string;
  type: string;
  number: string;
  previousSoldier: string;
  newSoldier: string;
  actor: string;
  note: string;
}

export interface ManagedSettings {
  equipmentTypes: string[];
  platoons: string[];
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  userEmail: string;
  isReadOnly: boolean;
  sheetIds: Record<string, number>;
}

export interface CompanyData {
  meta: SpreadsheetMeta;
  soldiers: Soldier[];
  equipment: Equipment[];
  history: HistoryEntry[];
  settings: ManagedSettings;
}

export interface CompatibilityIssue {
  tab: string;
  message: string;
}

export type LoadResult =
  | { kind: 'ready'; data: CompanyData }
  | { kind: 'empty'; meta: SpreadsheetMeta }
  | { kind: 'incompatible'; meta: SpreadsheetMeta; issues: CompatibilityIssue[] };

export interface SoldierInput {
  name: string;
  personalNumber: string;
  platoon: string;
}

export interface EquipmentInput {
  type: string;
  number: string;
  note: string;
}

export interface HistoryDraft {
  action: string;
  type?: string;
  number?: string;
  previousSoldier?: string;
  newSoldier?: string;
  note?: string;
}
