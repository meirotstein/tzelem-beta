import type { AppServices } from "../App";
import {
  canAccessMethod,
  canAccessSoldier,
  resolveUserAccess,
} from "../domain/permissions";
import { catalogKey, numberedItemKey } from "../domain/schema";
import type {
  CompanyData,
  LoadResult,
  MovementEntry,
  SignatureRecord,
  SignatureSummary,
  SigningSessionInput,
  Soldier,
  SoldierInput,
} from "../domain/types";
import { SpreadsheetRepository } from "../services/spreadsheetRepository";

type E2EProfile = "admin" | "all" | "platoon" | "tzelem" | "readonly";

const PROFILE_USERS: Record<E2EProfile, { email: string; name: string }> = {
  admin: { email: "admin@example.com", name: "מנהלת בדיקות" },
  all: { email: "unconfigured@example.com", name: "משתמש ללא הגדרה" },
  platoon: { email: "platoon@example.com", name: "משתמש מחלקה 1" },
  tzelem: { email: "tzelem@example.com", name: "משתמש צל״מ" },
  readonly: { email: "reader@example.com", name: "משתמש לקריאה" },
};

const profileFromUrl = (): E2EProfile => {
  const value = new URL(window.location.href).searchParams.get("profile");
  return value && value in PROFILE_USERS ? (value as E2EProfile) : "admin";
};

const fixtureData = (profile: E2EProfile): CompanyData => {
  const user = PROFILE_USERS[profile];
  return {
    meta: {
      spreadsheetId: "e2e-sheet",
      title: "פלוגת בדיקות",
      editable: profile !== "readonly",
      userEmail: user.email,
      userName: user.name,
      sheets: [],
    },
    soldiers: [
      {
        row: 2,
        name: "דוד כהן",
        personalNumber: "1111111",
        platoon: "1",
        active: true,
        phone: "0501111111",
      },
      {
        row: 3,
        name: "מאיר לוי",
        personalNumber: "2222222",
        platoon: "2",
        active: true,
        phone: "0502222222",
      },
      {
        row: 4,
        name: "יהודה ישראלי",
        personalNumber: "4444444",
        platoon: "1",
        active: true,
        phone: "0503333333",
      },
    ],
    catalog: [
      {
        row: 2,
        type: "חולצה",
        variant: "מ",
        variantLabel: "מידה",
        method: "כמותי",
        totalStock: 20,
        location: "מחסן",
        standard: 12,
        note: "",
        active: true,
      },
      {
        row: 3,
        type: "אפוד",
        variant: "קרמי",
        variantLabel: "דגם",
        method: "צל״מ",
        totalStock: 0,
        location: "נשקייה",
        standard: 2,
        note: "",
        active: true,
      },
    ],
    numberedItems: [
      {
        row: 2,
        type: "אפוד",
        variant: "קרמי",
        number: "צ-100",
        status: "זמין",
        assignedTo: "",
        location: "נשקייה",
        note: "",
        active: true,
      },
      {
        row: 3,
        type: "אפוד",
        variant: "קרמי",
        number: "צ-200",
        status: "משויך",
        assignedTo: "2222222",
        location: "",
        note: "",
        active: true,
      },
    ],
    holdings: [
      {
        row: 2,
        personalNumber: "1111111",
        type: "חולצה",
        variant: "מ",
        quantity: 2,
      },
    ],
    equipmentGroups: [
      { row: 2, name: "ערכת בסיס", note: "", active: true },
    ],
    equipmentGroupItems: [
      {
        row: 2,
        groupName: "ערכת בסיס",
        type: "חולצה",
        variant: "מ",
        quantity: 1,
        active: true,
      },
    ],
    movements: [],
    signatures: [],
    permissions: [
      {
        row: 2,
        email: "admin@example.com",
        admin: true,
        equipmentScope: "הכל",
        platoons: ["1"],
      },
      {
        row: 3,
        email: "platoon@example.com",
        admin: false,
        equipmentScope: "הכל",
        platoons: ["1"],
      },
      {
        row: 4,
        email: "tzelem@example.com",
        admin: false,
        equipmentScope: "צל״מ",
        platoons: [],
      },
    ],
    settings: {
      platoons: ["1", "2"],
      locations: ["מחסן", "נשקייה"],
      schemaVersion: "e2e",
      writeMode: "coordinated",
      writeModeIssue: false,
    },
  };
};

class FakeAuthService {
  constructor(private readonly profile: E2EProfile) {}

  async init(): Promise<void> {}
  isSignedIn(): boolean {
    return true;
  }
  async restoreSession(): Promise<string> {
    return "e2e-token";
  }
  async signIn(): Promise<string> {
    return "e2e-token";
  }
  currentUserName(): string {
    return PROFILE_USERS[this.profile].name;
  }
  signOut(): void {}
}

class FakeSpreadsheetRepository extends SpreadsheetRepository {
  constructor(
    spreadsheetId: string,
    private readonly store: {
      data: CompanyData;
      signatures: Map<number, SignatureRecord>;
      failure: string;
    },
  ) {
    super(spreadsheetId);
  }

  override async inspect(): Promise<LoadResult> {
    return { kind: "ready", data: structuredClone(this.store.data) };
  }

  override takeConcurrencyNotice(): string {
    return "";
  }

  override async addSoldier(
    data: CompanyData,
    input: SoldierInput,
  ): Promise<void> {
    if (this.store.failure === "add-soldier")
      throw new Error("כשל בדיקה בשמירת החייל.");
    if (!data.meta.editable) throw new Error("הגיליון פתוח לקריאה בלבד.");
    const access = resolveUserAccess(data.meta.userEmail, data.permissions);
    const soldier: Soldier = {
      row: Math.max(1, ...this.store.data.soldiers.map((item) => item.row)) + 1,
      name: input.name.trim(),
      personalNumber: input.personalNumber.trim(),
      platoon: input.platoon.trim(),
      active: input.active ?? true,
      phone: input.phone?.trim() || "",
    };
    if (!canAccessSoldier(access, soldier))
      throw new Error("אין הרשאה להוסיף חייל למחלקה זו.");
    if (
      this.store.data.soldiers.some(
        (item) => item.personalNumber === soldier.personalNumber,
      )
    )
      throw new Error("המספר האישי כבר קיים במערכת.");
    this.store.data.soldiers.push(soldier);
    this.store.data.movements.push({
      row: this.store.data.movements.length + 2,
      timestamp: new Date().toISOString(),
      action: "הוספת חייל",
      method: "",
      type: "",
      variant: "",
      number: "",
      quantity: 0,
      previousSoldier: "",
      newSoldier: soldier.personalNumber,
      actor: data.meta.userEmail,
      note: "",
    });
  }

  override async saveSigningSession(
    data: CompanyData,
    soldier: Soldier,
    input: SigningSessionInput,
  ): Promise<MovementEntry[]> {
    if (this.store.failure === "signing")
      throw new Error("כשל בדיקה בשמירת ההחתמה.");
    this.ensureSigningAccess(data, soldier, input);
    const timestamp = new Date().toISOString();
    const actor = this.store.data.meta.userEmail;
    const access = resolveUserAccess(data.meta.userEmail, data.permissions);
    const movements: MovementEntry[] = [];
    const appendMovement = (
      movement: Omit<MovementEntry, "row" | "timestamp" | "actor">,
    ) => {
      movements.push({
        ...movement,
        row: this.store.data.movements.length + movements.length + 2,
        timestamp,
        actor,
      });
    };

    input.numberedToAssign.forEach((requested) => {
      const item = this.store.data.numberedItems.find(
        (candidate) =>
          numberedItemKey(candidate.type, candidate.number) ===
          numberedItemKey(requested.type, requested.number),
      );
      if (!item) throw new Error("פריט הצל״מ אינו קיים.");
      const previousSoldier = item.assignedTo;
      item.assignedTo = soldier.personalNumber;
      item.status = "משויך";
      appendMovement({
        action: previousSoldier ? "העברת צל״מ" : "החתמת צל״מ",
        method: "צל״מ",
        type: item.type,
        variant: item.variant,
        number: item.number,
        quantity: 0,
        previousSoldier,
        newSoldier: soldier.personalNumber,
        note: "",
      });
    });
    input.numberedTransfers.forEach(({ item: requested, from }) => {
      if (!canAccessSoldier(access, from))
        throw new Error("אין הרשאה לפעול עבור מחלקת חייל המקור.");
      const item = this.store.data.numberedItems.find(
        (candidate) =>
          numberedItemKey(candidate.type, candidate.number) ===
          numberedItemKey(requested.type, requested.number),
      );
      if (!item || item.assignedTo !== from.personalNumber)
        throw new Error("לא ניתן להעביר את פריט הצל״מ.");
      item.assignedTo = soldier.personalNumber;
      item.status = "משויך";
      appendMovement({
        action: "העברה",
        method: "צל״מ",
        type: item.type,
        variant: item.variant,
        number: item.number,
        quantity: 1,
        previousSoldier: from.personalNumber,
        newSoldier: soldier.personalNumber,
        note: "",
      });
    });
    input.numberedToReturn.forEach((requested) => {
      const item = this.store.data.numberedItems.find(
        (candidate) =>
          numberedItemKey(candidate.type, candidate.number) ===
          numberedItemKey(requested.type, requested.number),
      );
      if (!item) throw new Error("פריט הצל״מ אינו קיים.");
      item.assignedTo = "";
      item.status = "זמין";
      appendMovement({
        action: "החזרת צל״מ",
        method: "צל״מ",
        type: item.type,
        variant: item.variant,
        number: item.number,
        quantity: 0,
        previousSoldier: soldier.personalNumber,
        newSoldier: "",
        note: "",
      });
    });
    input.quantityTransfers.forEach(({ item, from, quantity }) => {
      if (!canAccessSoldier(access, from))
        throw new Error("אין הרשאה לפעול עבור מחלקת חייל המקור.");
      const key = catalogKey(item.type, item.variant);
      const source = this.store.data.holdings.find(
        (candidate) =>
          candidate.personalNumber === from.personalNumber &&
          catalogKey(candidate.type, candidate.variant) === key,
      );
      const target = this.store.data.holdings.find(
        (candidate) =>
          candidate.personalNumber === soldier.personalNumber &&
          catalogKey(candidate.type, candidate.variant) === key,
      );
      if (!source || source.quantity < quantity)
        throw new Error("הכמות להעברה גדולה מהכמות המוחזקת.");
      source.quantity -= quantity;
      if (target) target.quantity += quantity;
      else
        this.store.data.holdings.push({
          row: this.store.data.holdings.length + 2,
          personalNumber: soldier.personalNumber,
          type: item.type,
          variant: item.variant,
          quantity,
        });
      appendMovement({
        action: "העברה",
        method: "כמותי",
        type: item.type,
        variant: item.variant,
        number: "",
        quantity,
        previousSoldier: from.personalNumber,
        newSoldier: soldier.personalNumber,
        note: "",
      });
    });
    input.quantityTargets.forEach(({ item, quantity }) => {
      const key = catalogKey(item.type, item.variant);
      const holding = this.store.data.holdings.find(
        (candidate) =>
          candidate.personalNumber === soldier.personalNumber &&
          catalogKey(candidate.type, candidate.variant) === key,
      );
      const previous = holding?.quantity || 0;
      if (holding) holding.quantity = quantity;
      else if (quantity > 0)
        this.store.data.holdings.push({
          row: this.store.data.holdings.length + 2,
          personalNumber: soldier.personalNumber,
          type: item.type,
          variant: item.variant,
          quantity,
        });
      appendMovement({
        action: quantity > previous ? "החתמת ציוד כמותי" : "החזרת ציוד כמותי",
        method: "כמותי",
        type: item.type,
        variant: item.variant,
        number: "",
        quantity: Math.abs(quantity - previous),
        previousSoldier: quantity < previous ? soldier.personalNumber : "",
        newSoldier: quantity > previous ? soldier.personalNumber : "",
        note: "",
      });
    });

    this.store.data.holdings = this.store.data.holdings.filter(
      (holding) => holding.quantity > 0,
    );
    this.store.data.movements.push(...movements);
    const summary: SignatureSummary = {
      row: this.store.data.signatures.length + 2,
      timestamp,
      personalNumber: soldier.personalNumber,
      soldierName: soldier.name,
      actor,
      formatVersion: "1",
    };
    this.store.data.signatures.push(summary);
    this.store.signatures.set(summary.row, {
      ...summary,
      snapshot: {
        version: 1,
        soldierPersonalNumber: soldier.personalNumber,
        soldierName: soldier.name,
        changes: movements.map((movement) => ({
          action: movement.action,
          method: movement.method,
          type: movement.type,
          variant: movement.variant,
          number: movement.number,
          quantity: movement.quantity,
        })),
      },
      signature: structuredClone(input.signature),
    });
    return structuredClone(movements);
  }

  override async loadSignatureRecord(
    data: CompanyData,
    summary: SignatureSummary,
  ): Promise<SignatureRecord> {
    const access = resolveUserAccess(data.meta.userEmail, data.permissions);
    const soldier = data.soldiers.find(
      (candidate) => candidate.personalNumber === summary.personalNumber,
    );
    if (!soldier || !canAccessSoldier(access, soldier))
      throw new Error("אין הרשאה לצפות בחתימה זו.");
    const record = this.store.signatures.get(summary.row);
    if (!record) throw new Error("החתימה אינה קיימת.");
    return structuredClone(record);
  }

  private ensureSigningAccess(
    data: CompanyData,
    soldier: Soldier,
    input: SigningSessionInput,
  ) {
    if (!data.meta.editable) throw new Error("הגיליון פתוח לקריאה בלבד.");
    const access = resolveUserAccess(data.meta.userEmail, data.permissions);
    if (!canAccessSoldier(access, soldier))
      throw new Error("אין הרשאה לפעול עבור מחלקת החייל.");
    if (
      (input.numberedToAssign.length ||
        input.numberedToReturn.length ||
        input.numberedTransfers.length) &&
      !canAccessMethod(access, "צל״מ")
    )
      throw new Error("אין הרשאה לטפל בפריטי צל״מ.");
    if (
      (input.quantityTargets.length || input.quantityTransfers.length) &&
      !canAccessMethod(access, "כמותי")
    )
      throw new Error("אין הרשאה לטפל בציוד כמותי.");
  }
}

export function createE2EServices(): AppServices {
  const profile = profileFromUrl();
  const store = {
    data: fixtureData(profile),
    signatures: new Map<number, SignatureRecord>(),
    failure: new URL(window.location.href).searchParams.get("failure") || "",
  };
  return {
    auth: new FakeAuthService(profile),
    createRepository: (spreadsheetId) =>
      new FakeSpreadsheetRepository(spreadsheetId, store),
  };
}
