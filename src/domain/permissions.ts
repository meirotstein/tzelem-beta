import type {
  CompanyData,
  ManagementMethod,
  MovementEntry,
  PermissionInput,
  PermissionRecord,
  Soldier,
  UserAccess,
} from "./types";
import { catalogKey } from "./schema";

export const normalizeEmail = (value: string): string =>
  value.trim().toLowerCase();

export const resolveUserAccess = (
  email: string,
  permissions: PermissionRecord[],
): UserAccess => {
  const normalized = normalizeEmail(email);
  const permission = permissions.find(
    (candidate) => normalizeEmail(candidate.email) === normalized,
  );
  if (!permission)
    return {
      email: normalized,
      admin: false,
      equipmentScope: "הכל",
      platoons: [],
      defined: false,
    };
  return {
    email: normalized,
    admin: permission.admin,
    equipmentScope: permission.equipmentScope,
    platoons: [...permission.platoons],
    defined: true,
  };
};

export const canAccessMethod = (
  access: UserAccess,
  method: ManagementMethod | "",
): boolean =>
  access.admin ||
  !method ||
  access.equipmentScope === "הכל" ||
  access.equipmentScope === method;

export const canAccessPlatoon = (
  access: UserAccess,
  platoon: string,
): boolean =>
  access.admin || !access.platoons.length || access.platoons.includes(platoon);

export const hasAllPlatoons = (access: UserAccess): boolean =>
  access.admin || access.platoons.length === 0;

export const canAccessSoldier = (
  access: UserAccess,
  soldier: Soldier,
): boolean => canAccessPlatoon(access, soldier.platoon);

export const canAccessPersonalNumber = (
  access: UserAccess,
  personalNumber: string,
  data: CompanyData,
): boolean => {
  if (!personalNumber) return true;
  const soldier = data.soldiers.find(
    (candidate) => candidate.personalNumber === personalNumber,
  );
  return Boolean(soldier && canAccessSoldier(access, soldier));
};

export const canAccessMovement = (
  access: UserAccess,
  entry: MovementEntry,
  data: CompanyData,
): boolean => {
  if (entry.action === "עדכון הרשאות") return access.admin;
  return (
    canAccessMethod(access, entry.method) &&
    canAccessPersonalNumber(access, entry.previousSoldier, data) &&
    canAccessPersonalNumber(access, entry.newSoldier, data)
  );
};

export const scopeCompanyData = (
  data: CompanyData,
  access: UserAccess,
): CompanyData => {
  const soldiers = data.soldiers.filter((soldier) =>
    canAccessSoldier(access, soldier),
  );
  const personalNumbers = new Set(
    soldiers.map((soldier) => soldier.personalNumber),
  );
  const catalog = data.catalog.filter((item) =>
    canAccessMethod(access, item.method),
  );
  const catalogKeys = new Set(
    catalog.map((item) => catalogKey(item.type, item.variant)),
  );
  return {
    ...data,
    soldiers,
    catalog,
    numberedItems: data.numberedItems.filter(
      (item) =>
        canAccessMethod(access, "צל״מ") &&
        (!item.assignedTo || personalNumbers.has(item.assignedTo)),
    ),
    holdings: data.holdings.filter(
      (holding) =>
        personalNumbers.has(holding.personalNumber) &&
        catalogKeys.has(catalogKey(holding.type, holding.variant)),
    ),
    movements: data.movements.filter((entry) =>
      canAccessMovement(access, entry, data),
    ),
    signatures: data.signatures.filter((signature) =>
      canAccessPersonalNumber(access, signature.personalNumber, data),
    ),
    permissions: access.admin ? data.permissions : [],
    settings: {
      ...data.settings,
      platoons:
        access.admin || !access.platoons.length
          ? data.settings.platoons
          : data.settings.platoons.filter((platoon) =>
              access.platoons.includes(platoon),
            ),
    },
  };
};

export const validatePermissionInputs = (
  inputs: PermissionInput[],
  knownPlatoons: string[],
  requireAdmin = false,
): string[] => {
  const errors: string[] = [];
  const emails = new Set<string>();
  inputs.forEach((input) => {
    const email = normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.push(`כתובת אימייל לא תקינה: ${input.email || "חסרה"}.`);
    if (emails.has(email)) errors.push(`האימייל ${email} מופיע יותר מפעם אחת.`);
    emails.add(email);
    input.platoons.forEach((platoon) => {
      if (!knownPlatoons.includes(platoon))
        errors.push(`המחלקה ${platoon} אינה קיימת בהגדרות.`);
    });
  });
  if ((requireAdmin || inputs.length > 0) && !inputs.some((input) => input.admin))
    errors.push("חייב להישאר לפחות מנהל אחד בהרשאות.");
  return [...new Set(errors)];
};
