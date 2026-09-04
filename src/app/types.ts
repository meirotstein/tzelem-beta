import type { CatalogItem, NumberedItem, SignatureRecord, SignatureSummary, Soldier } from "../domain/types";

export type View =
  "dashboard" | "signings" | "soldiers" | "inventory" | "history" | "settings";
export type AppState =
  "booting" | "signed-out" | "select-sheet" | "loading" | "result" | "error";
export type Action =
  | {
      kind: "numbered";
      item: NumberedItem;
      mode: "assign" | "return" | "status";
    }
  | {
      kind: "quantity";
      item: CatalogItem;
      mode: "issue" | "return" | "transfer";
      soldier?: Soldier;
    }
  | { kind: "stock"; item: CatalogItem }
  | null;
export type SigningSeed =
  | { kind: "numbered"; item: NumberedItem }
  | { kind: "quantity"; item: CatalogItem }
  | {
      kind: "numberedTransfer";
      item: NumberedItem;
      from: Soldier;
      note: string;
    }
  | {
      kind: "quantityTransfer";
      item: CatalogItem;
      from: Soldier;
      quantity: number;
      note: string;
    };
export type SignatureViewerState = {
  key: string;
  summary: SignatureSummary;
  record: SignatureRecord | null;
  loading: boolean;
  error: string;
};
export type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};
