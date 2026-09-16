import { describe, expect, it } from "vitest";
import {
  calculateMegapixels,
  decideUpscale,
  isLikelyDuplicate,
  minimumTargetDimensions,
  similarityFromHashes,
} from "./image";
describe("image decisions", () => {
  it("calculates megapixels", () =>
    expect(calculateMegapixels(2000, 2000)).toBe(4));
  it("skips upscale at 4MP", () =>
    expect(decideUpscale(2000, 2000).required).toBe(false));
  it("requires upscale below 4MP", () =>
    expect(decideUpscale(1600, 1200).required).toBe(true));
  it("targets a 4.2MP safety margin while preserving aspect ratio", () => {
    const target = minimumTargetDimensions(1600, 1200);
    expect(target.width / target.height).toBeCloseTo(4 / 3, 2);
    expect(target.width * target.height).toBeGreaterThanOrEqual(4_200_000);
  });
  it("uses perceptual similarity thresholds", () => {
    expect(
      similarityFromHashes("ffffffffffffffff", "fffffffffffffffe"),
    ).toBeGreaterThan(0.9);
    expect(isLikelyDuplicate("ffffffffffffffff", "fffffffffffffffe")).toBe(
      true,
    );
    expect(isLikelyDuplicate("ffffffffffffffff", "0000000000000000")).toBe(
      false,
    );
  });
});
