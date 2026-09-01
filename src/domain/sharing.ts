import { itemLabel } from "./schema";
import type {
  CatalogItem,
  CompanyData,
  MovementEntry,
  NumberedItem,
  Soldier,
} from "./types";

export interface SoldierShareFilters {
  query: string;
  platoon: string;
  equipmentState: string;
  showArchived: boolean;
}

export interface InventoryShareFilters {
  query: string;
  type: string;
  method: string;
  status: string;
  platoon: string;
  showArchived: boolean;
}

const filterSummary = (parts: string[]) =>
  parts.length ? `_סינון: ${parts.join(" · ")}_` : "_ללא סינון_";

export function buildSoldiersWhatsAppMessage(
  data: CompanyData,
  soldiers: Soldier[],
  filters: SoldierShareFilters,
): string {
  const filterParts = [
    filters.query.trim() && `חיפוש: ${filters.query.trim()}`,
    filters.platoon && `מחלקה ${filters.platoon}`,
    filters.equipmentState === "assigned" && "עם ציוד",
    filters.equipmentState === "none" && "ללא ציוד",
    filters.showArchived && "כולל שהוסרו",
  ].filter(Boolean) as string[];
  const lines = [
    "*רשימת חיילים וציוד*",
    filterSummary(filterParts),
    `סה״כ חיילים: ${soldiers.length}`,
    "",
  ];
  const platoons = [
    ...new Set(soldiers.map((soldier) => soldier.platoon)),
  ].sort((a, b) => a.localeCompare(b, "he"));
  platoons.forEach((platoon) => {
    lines.push(`*[מחלקה ${platoon}]*`, "");
    soldiers
      .filter((soldier) => soldier.platoon === platoon)
      .forEach((soldier) => {
        lines.push(`*${soldier.name}*${soldier.active ? "" : " [הוסר]"}`);
        const numbered = data.numberedItems.filter(
          (item) => item.active && item.assignedTo === soldier.personalNumber,
        );
        const quantities = data.holdings.filter(
          (holding) =>
            holding.personalNumber === soldier.personalNumber &&
            holding.quantity > 0,
        );
        numbered.forEach((item) =>
          lines.push(
            `• ${itemLabel(item.type, item.variant)} — ${item.number}`,
          ),
        );
        quantities.forEach((holding) => {
          const catalog = data.catalog.find(
            (item) =>
              item.type === holding.type && item.variant === holding.variant,
          );
          lines.push(
            `• ${itemLabel(holding.type, holding.variant, catalog?.variantLabel)} — ${holding.quantity} יח׳`,
          );
        });
        if (!numbered.length && !quantities.length) lines.push("• ללא ציוד");
        lines.push("");
      });
  });
  return lines.join("\n").trim();
}

export function buildInventoryWhatsAppMessage(
  data: CompanyData,
  numbered: NumberedItem[],
  quantityCatalog: CatalogItem[],
  filters: InventoryShareFilters,
): string {
  const filterParts = [
    filters.query.trim() && `חיפוש: ${filters.query.trim()}`,
    filters.type && `סוג: ${filters.type}`,
    filters.method && `שיטה: ${filters.method}`,
    filters.status && `סטטוס: ${filters.status}`,
    filters.platoon && `מחלקה ${filters.platoon}`,
    filters.showArchived && "כולל שהוסרו",
  ].filter(Boolean) as string[];
  const lines = ["*מלאי ציוד פלוגתי*", filterSummary(filterParts), ""];
  const types = [
    ...new Set([
      ...numbered.map((item) => item.type),
      ...quantityCatalog.map((item) => item.type),
    ]),
  ].sort((a, b) => a.localeCompare(b, "he"));
  types.forEach((type) => {
    lines.push(`*[${type}]*`, "");
    numbered
      .filter((item) => item.type === type)
      .forEach((item) => {
        const holder = data.soldiers.find(
          (soldier) => soldier.personalNumber === item.assignedTo,
        );
        lines.push(
          `• ${item.variant ? `${item.variant} · ` : ""}${item.number} — ${holder ? `${holder.name} (מחלקה ${holder.platoon})` : "לא משויך"} · ${item.status}${item.active ? "" : " · הוסר"}`,
        );
      });
    quantityCatalog
      .filter((item) => item.type === type)
      .forEach((item) => {
        const holdings = data.holdings.filter((holding) => {
          if (
            holding.type !== item.type ||
            holding.variant !== item.variant ||
            holding.quantity <= 0
          )
            return false;
          if (!filters.platoon) return true;
          return (
            data.soldiers.find(
              (soldier) => soldier.personalNumber === holding.personalNumber,
            )?.platoon === filters.platoon
          );
        });
        const issued = holdings.reduce(
          (sum, holding) => sum + holding.quantity,
          0,
        );
        lines.push(
          `• ${itemLabel(item.type, item.variant, item.variantLabel)} — מלאי ${item.totalStock}, מוחזק ${issued}, זמין ${item.totalStock - issued}${item.active ? "" : " · הוסר"}`,
        );
        holdings.forEach((holding) => {
          const soldier = data.soldiers.find(
            (candidate) => candidate.personalNumber === holding.personalNumber,
          );
          lines.push(
            `  ◦ ${soldier?.name || holding.personalNumber}: ${holding.quantity} יח׳`,
          );
        });
      });
    lines.push("");
  });
  return lines.join("\n").trim();
}

export function buildSoldierMovementsWhatsAppMessage(
  soldier: Soldier,
  movements: MovementEntry[],
  rangeLabel: string,
): string {
  const lines = [
    `*אישור תנועות ציוד — ${soldier.name}*`,
    `מספר אישי: ${soldier.personalNumber}`,
    `טווח: ${rangeLabel}`,
    "",
  ];
  movements.forEach((entry) => {
    const direction =
      entry.newSoldier === soldier.personalNumber
        ? "אליך"
        : entry.previousSoldier === soldier.personalNumber
          ? "ממך"
          : "";
    lines.push(
      `• *${entry.action}* ${direction}`,
      `  ${itemLabel(entry.type, entry.variant)}${entry.number ? ` · ${entry.number}` : ""}${entry.quantity > 0 ? ` · כמות ${entry.quantity}` : ""}`,
      `  בוצע על ידי: ${entry.actor || "לא צוין"}`,
      `  ${formatMovementDate(entry.timestamp)}${entry.note ? ` · ${entry.note}` : ""}`,
      "",
    );
  });
  return lines.join("\n").trim();
}

function formatMovementDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function normalizeWhatsAppPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `972${digits.slice(1)}`;
  return digits.length >= 9 && digits.length <= 15 ? digits : "";
}

export function shareOnWhatsApp(message: string, phone = ""): void {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const recipient = normalizedPhone ? `phone=${normalizedPhone}&` : "";
  window.location.href = `whatsapp://send?${recipient}text=${encodeURIComponent(message)}`;
}
