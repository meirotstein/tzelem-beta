import { describe, expect, it } from "vitest";
import {
  buildInventoryWhatsAppMessage,
  buildSoldierMovementsWhatsAppMessage,
  buildSoldiersWhatsAppMessage,
  normalizeWhatsAppPhone,
} from "./sharing";
import type { CompanyData } from "./types";

const data = {
  soldiers: [
    {
      row: 2,
      name: "דנה",
      personalNumber: "1",
      platoon: "א",
      active: true,
      phone: "050-1234567",
    },
    {
      row: 3,
      name: "נועם",
      personalNumber: "2",
      platoon: "ב",
      active: true,
      phone: "",
    },
  ],
  catalog: [
    {
      row: 2,
      type: "נשק",
      variant: "",
      variantLabel: "",
      method: "צל״מ",
      totalStock: 0,
      location: "",
      note: "",
      active: true,
    },
    {
      row: 3,
      type: "חולצה",
      variant: "M",
      variantLabel: "מידה",
      method: "כמותי",
      totalStock: 10,
      location: "מחסן פלוגתי",
      note: "",
      active: true,
    },
  ],
  numberedItems: [
    {
      row: 2,
      type: "נשק",
      variant: "",
      number: "100",
      status: "משויך",
      assignedTo: "1",
      location: "מחסן פלוגתי",
      note: "",
      active: true,
    },
    {
      row: 3,
      type: "משקפת",
      variant: "",
      number: "200",
      status: "זמין",
      assignedTo: "",
      location: "",
      note: "",
      active: true,
    },
  ],
  holdings: [
    { row: 2, personalNumber: "1", type: "חולצה", variant: "M", quantity: 2 },
  ],
  equipmentGroups: [],
  equipmentGroupItems: [],
  movements: [],
  signatures: [],
  permissions: [],
  settings: {
    platoons: ["א", "ב"],
    locations: ["מחסן פלוגתי"],
    schemaVersion: "8",
  },
  meta: {
    spreadsheetId: "x",
    title: "x",
    editable: true,
    userEmail: "",
    userName: "",
    sheets: [],
  },
} as CompanyData;

describe("WhatsApp sharing", () => {
  it("shares only filtered soldiers with numbered and quantity equipment", () => {
    const message = buildSoldiersWhatsAppMessage(data, [data.soldiers[0]], {
      query: "",
      platoon: "א",
      equipmentState: "assigned",
      showArchived: false,
    });
    expect(message).toContain("מחלקה א · עם ציוד");
    expect(message).toContain("נשק — 100");
    expect(message).toContain("מיקום מחסן פלוגתי");
    expect(message).toContain("חולצה · מידה M — 2 יח׳");
    expect(message).not.toContain("נועם");
  });

  it("shares filtered numbered and quantity inventory", () => {
    const message = buildInventoryWhatsAppMessage(
      data,
      [data.numberedItems[0]],
      [data.catalog[1]],
      {
        query: "",
        type: "",
        method: "",
        status: "",
        platoon: "",
        showArchived: false,
      },
    );
    expect(message).toContain("100 — דנה (מחלקה א) · משויך");
    expect(message).toContain("מלאי 10, מוחזק 2, זמין 8");
    expect(message).toContain("מיקום מחסן פלוגתי");
    expect(message).not.toContain("200");
  });

  it("builds a soldier movement confirmation with the action performer", () => {
    const message = buildSoldierMovementsWhatsAppMessage(
      data.soldiers[0],
      [
        {
          row: 4,
          timestamp: "2026-08-31T20:00:00.000Z",
          action: "החתמה",
          method: "צל״מ",
          type: "נשק",
          variant: "",
          number: "100",
          quantity: 1,
          previousSoldier: "",
          newSoldier: "1",
          actor: "admin@example.com",
          note: "",
        },
      ],
      "10 דקות אחרונות",
    );
    expect(message).toContain("אישור תנועות ציוד — דנה");
    expect(message).toContain("החתמה");
    expect(message).toContain("בוצע על ידי: admin@example.com");
  });

  it("normalizes local and international WhatsApp numbers", () => {
    expect(normalizeWhatsAppPhone("050-1234567")).toBe("972501234567");
    expect(normalizeWhatsAppPhone("+972 50 123 4567")).toBe("972501234567");
    expect(normalizeWhatsAppPhone("123")).toBe("");
  });
});
