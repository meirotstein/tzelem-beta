/* global Sheets */

const STATE_TITLES = [
  "חיילים",
  "קטלוג",
  "פריטי צל״מ",
  "החזקות כמותיות",
  "ערכות",
  "פריטי ערכה",
  "הרשאות",
  "הגדרות",
];
const MOVEMENTS_TITLE = "תנועות";
const SIGNATURES_TITLE = "חתימות";
const ALLOWED_TITLES = STATE_TITLES.concat([
  MOVEMENTS_TITLE,
  SIGNATURES_TITLE,
]);
const ADMIN_ONLY_ACTIONS = new Set(["עדכון הגדרות", "עדכון הרשאות"]);
const ALL_PLATOONS_ACTIONS = new Set([
  "הוספת סוג ציוד",
  "עריכת סוג ציוד",
  "הפעלת סוג ציוד",
  "הסרת סוג ציוד",
  "הוספת ערכת ציוד",
  "עריכת ערכת ציוד",
  "הפעלת ערכת ציוד",
  "הסרת ערכת ציוד",
  "הוספת מלאי",
  "הפחתת מלאי",
  "עריכת פריט צל״מ",
  "הפעלת פריט צל״מ",
  "הסרת פריט צל״מ",
]);

function applyMutation(payload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return failure(
      "LOCK_TIMEOUT",
      "מתבצעת כרגע שמירה אחרת. נסו שוב בעוד מספר שניות.",
    );
  }
  try {
    return applyMutationLocked(payload || {});
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return failure(
      "SERVICE_ERROR",
      "שירות השמירה המתואמת לא הצליח להשלים את הפעולה.",
    );
  } finally {
    lock.releaseLock();
  }
}

function applyMutationLocked(payload) {
  const spreadsheetId = clean(payload.spreadsheetId);
  const requestKey = clean(payload.requestKey);
  const expectedActor = clean(payload.expectedActor).toLowerCase();
  if (!spreadsheetId || !requestKey || requestKey.length > 120)
    return failure("INVALID_REQUEST", "בקשת השמירה אינה תקינה.");

  const actor = clean(Session.getActiveUser().getEmail()).toLowerCase();
  if (!actor || (expectedActor && actor !== expectedActor))
    return failure(
      "AUTH",
      "לא ניתן לאמת את המשתמש המחובר עבור פעולת השמירה.",
    );

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheetById = {};
  const sheetByTitle = {};
  spreadsheet.getSheets().forEach((sheet) => {
    sheetById[String(sheet.getSheetId())] = sheet;
    sheetByTitle[sheet.getName()] = sheet;
  });
  for (const title of ALLOWED_TITLES) {
    if (!sheetByTitle[title])
      return failure("SCHEMA", `חסרה לשונית ${title}.`);
  }

  if (wasRequestApplied(sheetByTitle[MOVEMENTS_TITLE], requestKey))
    return { ok: true, duplicate: true, rebased: false };

  const currentRows = {};
  STATE_TITLES.forEach((title) => {
    currentRows[title] = readRows(sheetByTitle[title]);
  });
  const baseRows = {};
  STATE_TITLES.forEach((title) => {
    baseRows[title] = canonicalRows((payload.baseRows || {})[title] || []);
  });
  const projectedRows = deepClone(currentRows);
  const requests = deepClone(payload.requests || []);
  if (!requests.length)
    return failure("INVALID_REQUEST", "בקשת השמירה אינה מכילה שינויים.");

  let rebased = STATE_TITLES.some(
    (title) => !same(currentRows[title], baseRows[title]),
  );
  let movementCount = 0;
  let stateTouched = false;
  const changedTitles = new Set();
  const movementRows = [];

  for (const request of requests) {
    const body = request.updateCells || request.appendCells;
    if (!body)
      return failure(
        "INVALID_REQUEST",
        "שירות השמירה קיבל סוג עדכון שאינו נתמך.",
      );
    const sheet = sheetById[String(body.range?.sheetId ?? body.sheetId)];
    if (!sheet || !ALLOWED_TITLES.includes(sheet.getName()))
      return failure("INVALID_REQUEST", "בקשת השמירה מפנה ללשונית לא מוכרת.");
    const title = sheet.getName();
    if (title === MOVEMENTS_TITLE) {
      const rows = body.rows || [];
      rows.forEach((row) => {
        const values = decodeRow(row);
        values[9] = actor;
        values[11] = requestKey;
        row.values = encodeRow(values);
        movementRows.push(values);
        movementCount += 1;
      });
      continue;
    }
    if (title === SIGNATURES_TITLE) {
      (body.rows || []).forEach((row) => {
        const values = decodeRow(row);
        values[3] = actor;
        row.values = encodeRow(values);
      });
      continue;
    }
    stateTouched = true;
    changedTitles.add(title);
    const resolution = request.updateCells
      ? resolveUpdate(
          request.updateCells,
          title,
          baseRows[title],
          currentRows[title],
          projectedRows[title],
        )
      : resolveAppend(
          request.appendCells,
          title,
          currentRows[title],
          projectedRows[title],
        );
    if (!resolution.ok) return resolution;
    if (resolution.rebased) rebased = true;
  }

  if (stateTouched && !movementCount)
    return failure("INVALID_REQUEST", "פעולת השמירה חסרה רישום בתנועות.");
  const authorization = authorize(
    actor,
    movementRows,
    currentRows,
    projectedRows,
    changedTitles,
  );
  if (!authorization.ok) return authorization;
  const validation = validateProjected(projectedRows);
  if (!validation.ok) return validation;

  Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheetId);
  return { ok: true, duplicate: false, rebased };
}

function resolveUpdate(update, title, base, current, projected) {
  const range = update.range || {};
  const start = Number(range.startRowIndex || 0);
  const rowRequests = update.rows || [];
  const count = Number(range.endRowIndex || start + rowRequests.length) - start;
  if (title === "הגדרות" || title === "הרשאות" || count !== 1 || rowRequests.length !== 1) {
    if (!same(base, current))
      return failure(
        "STALE_ADMIN",
        "הנתונים השתנו מאז שפתחת את המסך. יש לטעון את הנתונים המעודכנים ולנסות שוב.",
      );
    applyUpdate(projected, start, rowRequests);
    return { ok: true, rebased: false };
  }

  const expected = canonicalRow(base[start] || []);
  const desired = canonicalRow(decodeRow(rowRequests[0]));
  const key = rowKey(title, expected);
  if (!key)
    return failure("INVALID_REQUEST", `לא ניתן לזהות את הרשומה בלשונית ${title}.`);
  const currentIndex = current.findIndex((row, index) => index > 0 && rowKey(title, row) === key);
  if (currentIndex < 0)
    return failure("CONFLICT", `הרשומה בלשונית ${title} כבר אינה קיימת.`);
  const latest = canonicalRow(current[currentIndex]);
  const changedColumns = [];
  const width = Math.max(expected.length, desired.length);
  for (let index = 0; index < width; index += 1) {
    if (!sameValue(expected[index], desired[index])) changedColumns.push(index);
  }
  const collidingColumn = changedColumns.find(
    (index) => !sameValue(expected[index], latest[index]),
  );
  if (collidingColumn !== undefined)
    return failure(
      "CONFLICT",
      conflictMessage(title, expected),
    );

  const merged = latest.slice();
  changedColumns.forEach((index) => {
    merged[index] = desired[index] === undefined ? "" : desired[index];
  });
  update.range.startRowIndex = currentIndex;
  update.range.endRowIndex = currentIndex + 1;
  update.rows = [{ values: encodeRow(merged) }];
  projected[currentIndex] = canonicalRow(merged);
  return {
    ok: true,
    rebased: currentIndex !== start || !same(expected, latest),
  };
}

function resolveAppend(append, title, current, projected) {
  let rebased = false;
  for (const rowRequest of append.rows || []) {
    const row = canonicalRow(decodeRow(rowRequest));
    const key = rowKey(title, row);
    if (key && projected.some((candidate, index) => index > 0 && rowKey(title, candidate) === key)) {
      return failure("CONFLICT", duplicateMessage(title, row));
    }
    projected.push(row);
    if (!same(current, projected.slice(0, current.length))) rebased = true;
  }
  return { ok: true, rebased };
}

function authorize(actor, movements, currentRows, projectedRows, changedTitles) {
  const permissions = currentRows["הרשאות"].slice(1);
  const permission = permissions.find(
    (row) => clean(row[0]).toLowerCase() === actor,
  );
  const admin = permission ? yes(permission[1]) : false;
  const scope = admin ? "הכל" : clean(permission ? permission[2] : "הכל") || "הכל";
  const platoons = admin
    ? []
    : clean(permission ? permission[3] : "")
        .split(/[,،;\n]/)
        .map(clean)
        .filter(Boolean);
  if (
    (changedTitles.has("הרשאות") || changedTitles.has("הגדרות")) &&
    !admin
  )
    return failure("PERMISSION", "הפעולה זמינה למנהלים בלבד.");
  const soldiers = projectedRows["חיילים"].slice(1);
  const platoonFor = (personalNumber) => {
    const soldier = soldiers.find((row) => clean(row[1]) === clean(personalNumber));
    return soldier ? clean(soldier[2]) : "";
  };

  for (const movement of movements) {
    const action = clean(movement[1]);
    const method = clean(movement[2]);
    if (ADMIN_ONLY_ACTIONS.has(action) && !admin)
      return failure("PERMISSION", "הפעולה זמינה למנהלים בלבד.");
    if (method && scope !== "הכל" && scope !== method)
      return failure("PERMISSION", "אין לך הרשאה לטפל בסוג ציוד זה.");
    if (ALL_PLATOONS_ACTIONS.has(action) && platoons.length)
      return failure(
        "PERMISSION",
        "הפעולה אינה זמינה למשתמש שמוגבל למחלקות מסוימות.",
      );
    for (const personalNumber of [movement[7], movement[8]]) {
      const platoon = platoonFor(personalNumber);
      if (personalNumber && platoons.length && !platoons.includes(platoon))
        return failure("PERMISSION", "אין לך הרשאה לפעול עבור מחלקת החייל.");
    }
  }
  return { ok: true };
}

function validateProjected(rows) {
  const soldiers = rows["חיילים"].slice(1).filter((row) => clean(row[0]) || clean(row[1]));
  const soldierMap = new Map();
  for (const row of soldiers) {
    const personalNumber = clean(row[1]);
    if (!clean(row[0]) || !personalNumber || !clean(row[2]))
      return failure("INVALID_STATE", "לא ניתן לשמור חייל ללא שם, מספר אישי ומחלקה.");
    if (soldierMap.has(personalNumber))
      return failure("CONFLICT", `המספר האישי ${personalNumber} כבר קיים.`);
    soldierMap.set(personalNumber, row);
  }

  const catalog = rows["קטלוג"].slice(1).filter((row) => clean(row[0]) || clean(row[1]));
  const catalogMap = new Map();
  for (const row of catalog) {
    const key = pair(row[0], row[1]);
    if (!clean(row[0])) return failure("INVALID_STATE", "לא ניתן לשמור סוג ציוד ריק.");
    if (catalogMap.has(key))
      return failure("CONFLICT", `סוג הציוד ${itemName(row)} כבר קיים.`);
    const stock = Number(row[4]);
    if (clean(row[3]) === "כמותי" && (!Number.isInteger(stock) || stock < 0))
      return failure("INVALID_STATE", `המלאי של ${itemName(row)} אינו תקין.`);
    catalogMap.set(key, row);
  }

  const groupMap = new Map();
  for (const row of rows["ערכות"].slice(1).filter((candidate) => clean(candidate[0]))) {
    const name = clean(row[0]);
    if (groupMap.has(name))
      return failure("CONFLICT", `הערכה ${name} כבר קיימת.`);
    groupMap.set(name, row);
  }
  const groupItemKeys = new Set();
  const activeGroupItems = new Map();
  for (const row of rows["פריטי ערכה"].slice(1).filter((candidate) => clean(candidate[0]) || clean(candidate[1]))) {
    const groupName = clean(row[0]);
    const key = triple(row[0], row[1], row[2]);
    const quantity = Number(row[3]);
    if (!groupMap.has(groupName) || groupItemKeys.has(key))
      return failure("CONFLICT", `פריטי הערכה ${groupName} השתנו במקביל.`);
    if (!Number.isInteger(quantity) || quantity <= 0)
      return failure("INVALID_STATE", `כמות בפריטי הערכה ${groupName} אינה תקינה.`);
    groupItemKeys.add(key);
    if (active(row[4])) {
      const catalogRow = catalogMap.get(pair(row[1], row[2]));
      if (!catalogRow || clean(catalogRow[3]) !== "כמותי" || !active(catalogRow[6]))
        return failure("CONFLICT", `פריט פעיל בערכה ${groupName} אינו ציוד כמותי פעיל.`);
      activeGroupItems.set(groupName, (activeGroupItems.get(groupName) || 0) + 1);
    }
  }
  for (const [name, row] of groupMap.entries()) {
    if (active(row[2]) && !activeGroupItems.get(name))
      return failure("CONFLICT", `הערכה ${name} אינה מכילה פריטים פעילים.`);
  }

  const numberedKeys = new Set();
  for (const row of rows["פריטי צל״מ"].slice(1).filter((candidate) => clean(candidate[0]) || clean(candidate[2]))) {
    const key = pair(row[0], row[2]);
    if (!clean(row[0]) || !clean(row[2]))
      return failure("INVALID_STATE", "לא ניתן לשמור פריט צל״מ ללא סוג ומספר.");
    if (numberedKeys.has(key))
      return failure("CONFLICT", `פריט ${clean(row[0])} מספר ${clean(row[2])} כבר קיים.`);
    numberedKeys.add(key);
    const catalogRow = catalogMap.get(pair(row[0], row[1]));
    if (!catalogRow || clean(catalogRow[3]) !== "צל״מ")
      return failure("INVALID_STATE", `סוג הצל״מ ${itemName(row)} אינו קיים בקטלוג.`);
    const assignedTo = clean(row[4]);
    if ((assignedTo && clean(row[3]) !== "משויך") || (!assignedTo && clean(row[3]) === "משויך"))
      return failure("CONFLICT", `השיוך והסטטוס של ${clean(row[0])} ${clean(row[2])} אינם תואמים.`);
    if (assignedTo) {
      const soldier = soldierMap.get(assignedTo);
      if (!soldier || !active(soldier[3]) || !active(row[6]))
        return failure("CONFLICT", `לא ניתן לשייך את ${clean(row[0])} ${clean(row[2])} לחייל שאינו פעיל.`);
    }
    if (active(row[6]) && !active(catalogRow[6]))
      return failure("CONFLICT", `סוג הציוד ${itemName(catalogRow)} אינו פעיל.`);
  }

  const holdingKeys = new Set();
  const issued = new Map();
  for (const row of rows["החזקות כמותיות"].slice(1).filter((candidate) => clean(candidate[0]) || clean(candidate[1]))) {
    const key = triple(row[0], row[1], row[2]);
    const quantity = Number(row[3]);
    if (holdingKeys.has(key))
      return failure("CONFLICT", "קיימת החזקה כמותית כפולה לאותו חייל וציוד.");
    if (!Number.isInteger(quantity) || quantity < 0)
      return failure("INVALID_STATE", "כמות הציוד חייבת להיות מספר שלם שאינו שלילי.");
    holdingKeys.add(key);
    const soldier = soldierMap.get(clean(row[0]));
    const catalogRow = catalogMap.get(pair(row[1], row[2]));
    if (!soldier || !catalogRow || clean(catalogRow[3]) !== "כמותי")
      return failure("INVALID_STATE", "החזקה כמותית מפנה לחייל או ציוד שאינם קיימים.");
    if (quantity > 0 && (!active(soldier[3]) || !active(catalogRow[6])))
      return failure("CONFLICT", `לא ניתן להחתים את ${itemName(catalogRow)} לרשומה שאינה פעילה.`);
    const catalogKey = pair(row[1], row[2]);
    issued.set(catalogKey, (issued.get(catalogKey) || 0) + quantity);
  }
  for (const [key, quantity] of issued.entries()) {
    const catalogRow = catalogMap.get(key);
    const stock = Number(catalogRow[4]);
    if (!Number.isInteger(stock) || stock < quantity)
      return failure(
        "STOCK_CONFLICT",
        `לא ניתן לשמור: במלאי ${itemName(catalogRow)} נותרה כמות קטנה מהכמות המבוקשת.`,
      );
  }
  return { ok: true };
}

function applyUpdate(rows, start, rowRequests) {
  rowRequests.forEach((row, offset) => {
    rows[start + offset] = canonicalRow(decodeRow(row));
  });
}

function rowKey(title, row) {
  if (!row || !row.length) return "";
  if (title === "חיילים") return clean(row[1]);
  if (title === "קטלוג") return pair(row[0], row[1]);
  if (title === "פריטי צל״מ") return pair(row[0], row[2]);
  if (title === "החזקות כמותיות") return triple(row[0], row[1], row[2]);
  if (title === "ערכות") return clean(row[0]);
  if (title === "פריטי ערכה") return triple(row[0], row[1], row[2]);
  if (title === "הרשאות") return clean(row[0]).toLowerCase();
  return "";
}

function conflictMessage(title, row) {
  if (title === "חיילים")
    return `פרטי החייל ${clean(row[0]) || clean(row[1])} השתנו במקביל. יש לטעון את הנתונים המעודכנים.`;
  if (title === "פריטי צל״מ")
    return `הפריט ${clean(row[0])} מספר ${clean(row[2])} השתנה או הוחתם במקביל.`;
  if (title === "החזקות כמותיות")
    return `כמות ${clean(row[1])} של החייל השתנתה במקביל. יש לבדוק את הכמות המעודכנת.`;
  return `הרשומה ${itemName(row)} השתנתה במקביל. יש לטעון את הנתונים המעודכנים.`;
}

function duplicateMessage(title, row) {
  if (title === "חיילים") return `המספר האישי ${clean(row[1])} כבר קיים.`;
  if (title === "פריטי צל״מ")
    return `פריט ${clean(row[0])} מספר ${clean(row[2])} כבר קיים.`;
  if (title === "החזקות כמותיות")
    return "כמות הציוד של החייל השתנתה במקביל. יש לטעון את הנתונים המעודכנים.";
  if (title === "ערכות") return `הערכה ${clean(row[0])} כבר קיימת.`;
  return `הרשומה ${itemName(row)} כבר קיימת.`;
}

function wasRequestApplied(sheet, requestKey) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return sheet
    .getRange(2, 12, lastRow - 1, 1)
    .getDisplayValues()
    .some((row) => clean(row[0]) === requestKey);
}

function readRows(sheet) {
  const lastRow = Math.max(1, sheet.getLastRow());
  const lastColumn = Math.max(1, sheet.getLastColumn());
  return canonicalRows(sheet.getRange(1, 1, lastRow, lastColumn).getValues());
}

function decodeRow(row) {
  return (row.values || []).map((entry) => {
    const value = entry.userEnteredValue || {};
    if (Object.prototype.hasOwnProperty.call(value, "boolValue")) return value.boolValue;
    if (Object.prototype.hasOwnProperty.call(value, "numberValue")) return value.numberValue;
    if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
    return "";
  });
}

function encodeRow(values) {
  return values.map((value) => {
    if (typeof value === "boolean") return { userEnteredValue: { boolValue: value } };
    if (typeof value === "number") return { userEnteredValue: { numberValue: value } };
    return { userEnteredValue: { stringValue: String(value ?? "") } };
  });
}

function canonicalRows(rows) {
  const result = (rows || []).map(canonicalRow);
  while (result.length && !result[result.length - 1].some((value) => clean(value))) result.pop();
  return result;
}

function canonicalRow(row) {
  const result = (row || []).map((value) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "boolean" || typeof value === "number") return value;
    return String(value ?? "");
  });
  while (result.length && clean(result[result.length - 1]) === "") result.pop();
  return result;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameValue(left, right) {
  return JSON.stringify(left ?? "") === JSON.stringify(right ?? "");
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clean(value) {
  return String(value ?? "").trim();
}

function pair(first, second) {
  return `${clean(first)}\u0000${clean(second)}`;
}

function triple(first, second, third) {
  return `${clean(first)}\u0000${clean(second)}\u0000${clean(third)}`;
}

function itemName(row) {
  return [clean(row && row[0]), clean(row && row[1])].filter(Boolean).join(" · ");
}

function yes(value) {
  return ["true", "1", "כן"].includes(clean(value).toLowerCase());
}

function active(value) {
  return !["false", "0", "לא", "לא פעיל"].includes(clean(value).toLowerCase());
}

function failure(code, message) {
  return { ok: false, code, message };
}
