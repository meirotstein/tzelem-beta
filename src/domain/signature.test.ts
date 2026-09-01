import { describe, expect, it } from "vitest";
import {
  isValidSignature,
  parseSignature,
  signaturePathLength,
} from "./signature";
import type { SignatureData } from "./types";

const signature: SignatureData = {
  version: 1,
  strokes: [
    [
      [0.1, 0.2, 0],
      [0.12, 0.25, 10],
      [0.16, 0.3, 20],
      [0.21, 0.35, 30],
      [0.27, 0.32, 40],
      [0.33, 0.28, 50],
      [0.4, 0.3, 60],
      [0.48, 0.36, 70],
    ],
  ],
};

describe("signature data", () => {
  it("accepts a meaningful normalized signature and parses its JSON", () => {
    expect(isValidSignature(signature)).toBe(true);
    expect(signaturePathLength(signature)).toBeGreaterThan(0.08);
    expect(parseSignature(JSON.stringify(signature))).toEqual(signature);
  });

  it("rejects taps, out-of-range points, and malformed JSON", () => {
    expect(
      isValidSignature({ version: 1, strokes: [[[0.2, 0.2, 0]]] }),
    ).toBe(false);
    expect(
      isValidSignature({
        ...signature,
        strokes: [[[1.2, 0.2, 0], ...signature.strokes[0]]],
      }),
    ).toBe(false);
    expect(parseSignature("not json")).toBeNull();
  });
});
