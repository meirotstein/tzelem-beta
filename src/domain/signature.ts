import type {
  ManagementMethod,
  SignatureData,
  SignaturePoint,
  SigningSnapshot,
  SigningSnapshotChange,
} from "./types";

export const SIGNATURE_FORMAT_VERSION = "1";
export const MAX_SIGNATURE_POINTS = 1_000;

const isPoint = (value: unknown): value is SignaturePoint =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((part) => typeof part === "number" && Number.isFinite(part)) &&
  value[0] >= 0 &&
  value[0] <= 1 &&
  value[1] >= 0 &&
  value[1] <= 1 &&
  value[2] >= 0;

export const signaturePointCount = (signature: SignatureData): number =>
  signature.strokes.reduce((total, stroke) => total + stroke.length, 0);

export const signaturePathLength = (signature: SignatureData): number =>
  signature.strokes.reduce(
    (total, stroke) =>
      total +
      stroke.slice(1).reduce((strokeTotal, point, index) => {
        const previous = stroke[index];
        return (
          strokeTotal +
          Math.hypot(point[0] - previous[0], point[1] - previous[1])
        );
      }, 0),
    0,
  );

export const isValidSignature = (value: unknown): value is SignatureData => {
  if (!value || typeof value !== "object") return false;
  const signature = value as SignatureData;
  if (signature.version !== 1 || !Array.isArray(signature.strokes)) return false;
  const count = signaturePointCount(signature);
  return (
    count >= 8 &&
    count <= MAX_SIGNATURE_POINTS &&
    signature.strokes.every(
      (stroke) =>
        Array.isArray(stroke) && stroke.length > 0 && stroke.every(isPoint),
    ) &&
    signaturePathLength(signature) >= 0.08
  );
};

export const parseSignature = (value: unknown): SignatureData | null => {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return isValidSignature(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const isSnapshotChange = (value: unknown): value is SigningSnapshotChange => {
  if (!value || typeof value !== "object") return false;
  const change = value as SigningSnapshotChange;
  return (
    typeof change.action === "string" &&
    (["", "צל״מ", "כמותי"] as Array<ManagementMethod | "">).includes(
      change.method,
    ) &&
    typeof change.type === "string" &&
    typeof change.variant === "string" &&
    typeof change.number === "string" &&
    Number.isInteger(change.quantity) &&
    change.quantity >= 0
  );
};

export const parseSigningSnapshot = (
  value: unknown,
): SigningSnapshot | null => {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed?.version === 1 &&
      typeof parsed.soldierPersonalNumber === "string" &&
      typeof parsed.soldierName === "string" &&
      Array.isArray(parsed.changes) &&
      parsed.changes.every(isSnapshotChange)
      ? parsed
      : null;
  } catch {
    return null;
  }
};
