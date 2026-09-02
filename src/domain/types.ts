export const EQUIPMENT_STATUSES = [
  "זמין",
  "משויך",
  "תקול",
  "אבוד",
  "בתיקון",
  "מושבת",
] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const MANAGEMENT_METHODS = ["צל״מ", "כמותי"] as const;
export type ManagementMethod = (typeof MANAGEMENT_METHODS)[number];
export const EQUIPMENT_SCOPES = ["צל״מ", "כמותי", "הכל"] as const;
export type EquipmentScope = (typeof EQUIPMENT_SCOPES)[number];

export interface Soldier {
  row: number;
  name: string;
  personalNumber: string;
  platoon: string;
  active: boolean;
  phone: string;
}

export interface CatalogItem {
  row: number;
  type: string;
  variant: string;
  variantLabel: string;
  method: ManagementMethod;
  totalStock: number;
  location: string;
  standard?: number | null;
  note: string;
  active: boolean;
}

export interface NumberedItem {
  row: number;
  type: string;
  variant: string;
  number: string;
  status: EquipmentStatus;
  assignedTo: string;
  location: string;
  note: string;
  active: boolean;
}

export interface QuantityHolding {
  row: number;
  personalNumber: string;
  type: string;
  variant: string;
  quantity: number;
}

export interface EquipmentGroup {
  row: number;
  name: string;
  note: string;
  active: boolean;
}

export interface EquipmentGroupItem {
  row: number;
  groupName: string;
  type: string;
  variant: string;
  quantity: number;
  active: boolean;
}

export interface MovementEntry {
  row: number;
  timestamp: string;
  action: string;
  method: ManagementMethod | "";
  type: string;
  variant: string;
  number: string;
  quantity: number;
  previousSoldier: string;
  newSoldier: string;
  actor: string;
  note: string;
}

export type SignaturePoint = [x: number, y: number, elapsedMs: number];

export interface SignatureData {
  version: 1;
  strokes: SignaturePoint[][];
}

export interface SigningSnapshotChange {
  action: string;
  method: ManagementMethod | "";
  type: string;
  variant: string;
  number: string;
  quantity: number;
}

export interface SigningSnapshot {
  version: 1;
  soldierPersonalNumber: string;
  soldierName: string;
  changes: SigningSnapshotChange[];
}

export interface SignatureSummary {
  row: number;
  timestamp: string;
  personalNumber: string;
  soldierName: string;
  actor: string;
  formatVersion: string;
}

export interface SignatureRecord extends SignatureSummary {
  snapshot: SigningSnapshot;
  signature: SignatureData;
}

export interface ManagedSettings {
  platoons: string[];
  locations: string[];
  schemaVersion: string;
}

export interface PermissionRecord {
  row: number;
  email: string;
  admin: boolean;
  equipmentScope: EquipmentScope;
  platoons: string[];
}

export interface PermissionInput {
  email: string;
  admin: boolean;
  equipmentScope: EquipmentScope;
  platoons: string[];
}

export interface UserAccess {
  email: string;
  admin: boolean;
  equipmentScope: EquipmentScope;
  platoons: string[];
  defined: boolean;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  editable: boolean;
  userEmail: string;
  userName: string;
  sheets: Array<{
    id: number;
    title: string;
    rowCount: number;
    columnCount: number;
  }>;
}

export interface CompanyData {
  meta: SpreadsheetMeta;
  soldiers: Soldier[];
  catalog: CatalogItem[];
  numberedItems: NumberedItem[];
  holdings: QuantityHolding[];
  equipmentGroups: EquipmentGroup[];
  equipmentGroupItems: EquipmentGroupItem[];
  movements: MovementEntry[];
  signatures: SignatureSummary[];
  permissions: PermissionRecord[];
  settings: ManagedSettings;
}

export interface AdditiveSchemaUpgrade {
  missingSheets: string[];
  missingColumns: Array<{
    sheetTitle: string;
    startColumn: number;
    headers: string[];
  }>;
  settingsVersionRow: number;
}

export type LoadResult =
  | { kind: "ready"; data: CompanyData }
  | { kind: "empty"; meta: SpreadsheetMeta }
  | {
      kind: "upgradeable";
      meta: SpreadsheetMeta;
      issues: string[];
      upgrade: AdditiveSchemaUpgrade;
    }
  | { kind: "incompatible"; meta: SpreadsheetMeta; issues: string[] };

export interface SoldierInput {
  name: string;
  personalNumber: string;
  platoon: string;
  phone?: string;
  active?: boolean;
}

export interface CatalogInput {
  type: string;
  variant: string;
  variantLabel: string;
  method: ManagementMethod;
  totalStock: number;
  location: string;
  standard?: number | null;
  note: string;
  active?: boolean;
}

export interface NumberedItemInput {
  type: string;
  variant: string;
  number: string;
  status: EquipmentStatus;
  assignedTo?: string;
  location: string;
  note: string;
  active?: boolean;
}

export interface EquipmentGroupInput {
  name: string;
  note: string;
  items: Array<{
    type: string;
    variant: string;
    quantity: number;
  }>;
}

export interface MovementDraft {
  action: string;
  method?: ManagementMethod | "";
  type?: string;
  variant?: string;
  number?: string;
  quantity?: number;
  previousSoldier?: string;
  newSoldier?: string;
  note?: string;
}

export interface SigningSessionInput {
  numberedToAssign: NumberedItem[];
  numberedToReturn: NumberedItem[];
  quantityTargets: Array<{ item: CatalogItem; quantity: number }>;
  signature: SignatureData;
}
