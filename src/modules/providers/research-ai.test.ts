import { describe, expect, it } from "vitest";
import { MockTopicResearchProvider } from "./research-ai";

describe("MockTopicResearchProvider", () => {
  it("returns distinct, explainable topic opportunities", async () => {
    const provider = new MockTopicResearchProvider();
    const result = await provider.research({
      seedTopic: "healthy meal planning",
      targetRegion: "Indonesia",
      type: "evergreen",
      count: 4,
    });
    expect(result).toHaveLength(4);
    expect(new Set(result.map((item) => item.keyword)).size).toBe(4);
    expect(result.every((item) => item.rationale.includes("estimate"))).toBe(true);
    expect(result.every((item) => item.commercialIntent >= 0 && item.commercialIntent <= 100)).toBe(true);
  });
});
