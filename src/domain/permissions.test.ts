import { describe, expect, it } from "vitest";
import {
  canAccessMethod,
  canAccessPlatoon,
  resolveUserAccess,
  scopeCompanyData,
  validatePermissionInputs,
} from "./permissions";
import type { CompanyData } from "./types";

describe("permissions", () => {
  it("defaults an undefined user to all operational scopes without admin", () => {
    const access = resolveUserAccess("User@Example.com", []);
    expect(access).toMatchObject({
      email: "user@example.com",
      admin: false,
      equipmentScope: "הכל",
      platoons: [],
      defined: false,
    });
  });

  it("enforces equipment and platoon scopes while admins bypass them", () => {
    const access = resolveUserAccess("user@example.com", [
      {
        row: 2,
        email: "user@example.com",
        admin: false,
        equipmentScope: "צל״מ",
        platoons: ["1"],
      },
    ]);
    expect(canAccessMethod(access, "צל״מ")).toBe(true);
    expect(canAccessMethod(access, "כמותי")).toBe(false);
    expect(canAccessPlatoon(access, "1")).toBe(true);
    expect(canAccessPlatoon(access, "2")).toBe(false);
    expect(canAccessMethod({ ...access, admin: true }, "כמותי")).toBe(true);
  });

  it("validates unique emails, known platoons, and a remaining admin", () => {
    expect(
      validatePermissionInputs(
        [
          {
            email: "user@example.com",
            admin: false,
            equipmentScope: "הכל",
            platoons: ["missing"],
          },
        ],
        ["1"],
      ),
    ).toEqual(
      expect.arrayContaining([
        "המחלקה missing אינה קיימת בהגדרות.",
        "חייב להישאר לפחות מנהל אחד בהרשאות.",
      ]),
    );
  });

  it("removes out-of-scope records while retaining unassigned permitted equipment", () => {
    const access = resolveUserAccess("user@example.com", [
      {
        row: 2,
        email: "user@example.com",
        admin: false,
        equipmentScope: "צל״מ",
        platoons: ["1"],
      },
    ]);
    const data = {
      meta: {
        spreadsheetId: "x",
        title: "x",
        editable: true,
        userEmail: "user@example.com",
        userName: "User",
        sheets: [],
      },
      soldiers: [
        { row: 2, name: "א", personalNumber: "1", platoon: "1", active: true, phone: "" },
        { row: 3, name: "ב", personalNumber: "2", platoon: "2", active: true, phone: "" },
      ],
      catalog: [
        { row: 2, type: "נשק", variant: "", variantLabel: "", method: "צל״מ", totalStock: 0, note: "", active: true },
        { row: 3, type: "חולצה", variant: "", variantLabel: "", method: "כמותי", totalStock: 10, note: "", active: true },
      ],
      numberedItems: [
        { row: 2, type: "נשק", variant: "", number: "10", status: "זמין", assignedTo: "", note: "", active: true },
        { row: 3, type: "נשק", variant: "", number: "11", status: "משויך", assignedTo: "2", note: "", active: true },
      ],
      holdings: [],
      movements: [],
      signatures: [],
      permissions: [],
      settings: { platoons: ["1", "2"], schemaVersion: "4" },
    } satisfies CompanyData;

    const scoped = scopeCompanyData(data, access);
    expect(scoped.soldiers.map((soldier) => soldier.personalNumber)).toEqual(["1"]);
    expect(scoped.catalog.map((item) => item.method)).toEqual(["צל״מ"]);
    expect(scoped.numberedItems.map((item) => item.number)).toEqual(["10"]);
    expect(scoped.settings.platoons).toEqual(["1"]);
    expect(scoped.permissions).toEqual([]);
  });
});
