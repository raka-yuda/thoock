import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_CSV_COLUMNS,
  generateOpportunityCsvTemplate,
  parseOpportunityCsv,
} from "./opportunity-csv";

describe("research opportunity CSV", () => {
  it("parses research signals and preserves evidence fields", () => {
    const csv = [
      "keyword,target_region,type,target_event_date,competition_estimate,trend_growth,commercial_intent,seasonality,portfolio_performance,research_notes,buyer_use_cases,research_sources",
      'Healthy Ramadan meal preparation,Indonesia,seasonal,2027-02-08,18000,72,84,95,50,"Useful before Ramadan",food brands|publishers,https://example.test/research|https://example.test/source',
    ].join("\n");
    const result = parseOpportunityCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      row: 2,
      input: {
        keyword: "Healthy Ramadan meal preparation",
        targetRegion: "Indonesia",
        type: "seasonal",
        competition: 18000,
        trendGrowth: 72,
      },
      buyerUseCases: ["food brands", "publishers"],
      researchSources: [
        "https://example.test/research",
        "https://example.test/source",
      ],
    });
    expect(result.rows[0].score).toBeGreaterThan(0);
  });

  it("rejects missing numeric evidence and duplicate topic-region pairs", () => {
    const csv = [
      "keyword,target_region,type,competition_estimate,trend_growth,commercial_intent,seasonality,portfolio_performance",
      "Local home office,Indonesia,evergreen,25000,60,70,50,50",
      "local home office,indonesia,evergreen,25000,60,70,50,50",
      "Missing evidence,Indonesia,trending,Manual check required,80,80,40,50",
    ].join("\n");
    const result = parseOpportunityCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 3, field: "keyword" }),
        expect.objectContaining({ row: 4, field: "competition_estimate" }),
      ]),
    );
  });

  it("rejects impossible event dates", () => {
    const result = parseOpportunityCsv(
      "keyword,target_region,type,target_event_date,competition_estimate,trend_growth,commercial_intent,seasonality,portfolio_performance\nSeasonal concept,Indonesia,seasonal,2027-99-40,20000,70,80,90,50",
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ row: 2, field: "target_event_date" }),
    );
  });

  it("generates the exact header-only import template", () => {
    expect(generateOpportunityCsvTemplate().trim().split(",")).toEqual([
      ...OPPORTUNITY_CSV_COLUMNS,
    ]);
  });
});
