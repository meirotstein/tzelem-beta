import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Code.gs", import.meta.url), "utf8");
const context = vm.createContext({
  console,
  LockService: {},
  Session: {},
  SpreadsheetApp: {},
  Sheets: {},
  Set,
  Map,
});
vm.runInContext(source, context);

const cell = (value) =>
  typeof value === "boolean"
    ? { userEnteredValue: { boolValue: value } }
    : typeof value === "number"
      ? { userEnteredValue: { numberValue: value } }
      : { userEnteredValue: { stringValue: value } };
const update = (row, values) => ({
  range: { startRowIndex: row, endRowIndex: row + 1 },
  rows: [{ values: values.map(cell) }],
});

describe("Apps Script concurrency resolution", () => {
  it("relocates a row by its domain key and merges an unrelated field edit", () => {
    const base = [
      ["שם", "מספר אישי", "מחלקה", "פעיל", "טלפון"],
      ["דוד כהן", "123", "1", true, "050"],
    ];
    const current = [
      base[0],
      ["חייל אחר", "999", "2", true, ""],
      ["דוד כהן", "123", "1", true, "052"],
    ];
    const projected = current.map((row) => [...row]);
    const request = update(1, ["דוד כהן", "123", "1", false, "050"]);

    const result = context.resolveUpdate(
      request,
      "חיילים",
      base,
      current,
      projected,
    );

    expect(result).toEqual({ ok: true, rebased: true });
    expect(request.range.startRowIndex).toBe(2);
    expect(context.decodeRow(request.rows[0])).toEqual([
      "דוד כהן",
      "123",
      "1",
      false,
      "052",
    ]);
  });

  it("rejects two changes to the same field", () => {
    const base = [
      ["שם", "מספר אישי", "מחלקה", "פעיל", "טלפון"],
      ["דוד כהן", "123", "1", true, "050"],
    ];
    const current = [base[0], ["דוד כהן", "123", "1", false, "050"]];
    const request = update(1, ["דוד כהן", "123", "1", "", "050"]);

    const result = context.resolveUpdate(
      request,
      "חיילים",
      base,
      current,
      current.map((row) => [...row]),
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe("CONFLICT");
  });

  it("allows parallel quantity assignments while aggregate stock remains sufficient", () => {
    const rows = validRows({ stock: 5, holdings: [["1", "חולצה", "", 2], ["2", "חולצה", "", 3]] });
    expect(context.validateProjected(rows)).toEqual({ ok: true });
  });

  it("rejects the second quantity assignment when aggregate stock is exhausted", () => {
    const rows = validRows({ stock: 4, holdings: [["1", "חולצה", "", 2], ["2", "חולצה", "", 3]] });
    const result = context.validateProjected(rows);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("STOCK_CONFLICT");
  });
});

function validRows({ stock, holdings }) {
  return {
    "חיילים": [
      ["שם", "מספר אישי", "מחלקה", "פעיל", "טלפון"],
      ["חייל 1", "1", "1", true, ""],
      ["חייל 2", "2", "1", true, ""],
    ],
    "קטלוג": [
      ["סוג", "ערך מאפיין", "שם מאפיין", "שיטת ניהול", "מלאי כולל", "הערה", "פעיל"],
      ["חולצה", "", "", "כמותי", stock, "", true],
    ],
    "פריטי צל״מ": [["סוג"]],
    "החזקות כמותיות": [
      ["מספר אישי", "סוג", "ערך מאפיין", "כמות"],
      ...holdings,
    ],
    "ערכות": [["שם ערכה"]],
    "פריטי ערכה": [["שם ערכה"]],
    "הרשאות": [["אימייל"]],
    "הגדרות": [["מחלקות"]],
  };
}
