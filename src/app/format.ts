import type { EquipmentStatus, MovementEntry, SignatureSummary } from "../domain/types";

export const displayDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("he-IL", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
};
export const statusClass = (status: EquipmentStatus) =>
  status === "זמין"
    ? "success"
    : status === "משויך"
      ? "info"
      : ["אבוד", "מושבת"].includes(status)
        ? "danger"
        : "warning";
export const signatureForMovement = (
  entry: MovementEntry,
  signatures: SignatureSummary[],
) =>
  signatures.find(
    (signature) =>
      signature.timestamp === entry.timestamp &&
      (signature.personalNumber === entry.previousSoldier ||
        signature.personalNumber === entry.newSoldier),
  );

