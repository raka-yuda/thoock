import { describe, expect, it } from "vitest";
import {
  calculateOpportunityScore,
  explainOpportunityScore,
} from "./opportunity";
describe("opportunity score", () => {
  const base = {
    competition: 25000,
    trendGrowth: 70,
    commercialIntent: 80,
    seasonality: 65,
    portfolioPerformance: 55,
  };
  it("increases with stronger commercial signals", () =>
    expect(
      calculateOpportunityScore({ ...base, commercialIntent: 95 }),
    ).toBeGreaterThan(calculateOpportunityScore(base)));
  it("penalizes greater estimated supply", () =>
    expect(
      calculateOpportunityScore({ ...base, competition: 900000 }),
    ).toBeLessThan(calculateOpportunityScore(base)));
  it("explains that results estimate supply", () =>
    expect(
      explainOpportunityScore({
        ...base,
        keyword: "wellness",
        targetRegion: "ID",
        type: "evergreen",
      }),
    ).toContain("not customer demand"));
});
