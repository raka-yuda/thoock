import { describe, expect, it } from "vitest";
import {
  enforceMonthlyBudget,
  estimateGenerationCost,
  estimateUpscaleCost,
  isUpscaleDisproportionate,
} from "./cost";
describe("cost controls", () => {
  it("estimates generation by candidate count", () =>
    expect(estimateGenerationCost(0.08, 4)).toBe(0.32));
  it("keeps free methods at zero and missing paid pricing unknown", () => {
    expect(estimateUpscaleCost("sharp")).toBe(0);
    expect(estimateUpscaleCost("fast")).toBeNull();
    expect(estimateUpscaleCost("fast", { fast: 0.02 })).toBe(0.02);
  });
  it("warns at 80 percent and stops at 100 percent", () => {
    expect(
      enforceMonthlyBudget({
        spentUsd: 25,
        estimateUsd: 0,
        monthlyLimitIdr: 500000,
        usdToIdr: 16000,
      }).warning,
    ).toBe(true);
    expect(
      enforceMonthlyBudget({
        spentUsd: 31,
        estimateUsd: 1,
        monthlyLimitIdr: 500000,
        usdToIdr: 16000,
      }).hardStop,
    ).toBe(true);
  });
  it("allows an explicit override", () =>
    expect(
      enforceMonthlyBudget({
        spentUsd: 40,
        estimateUsd: 1,
        monthlyLimitIdr: 500000,
        usdToIdr: 16000,
        manualOverride: true,
      }).allowed,
    ).toBe(true));
  it("flags disproportionate upscale cost", () =>
    expect(isUpscaleDisproportionate(0.08, 0.25)).toBe(true));
});
