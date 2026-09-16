import { describe, expect, it } from "vitest";
import { MockBriefGenerationProvider } from "./brief-generation";

describe("MockBriefGenerationProvider", () => {
  it("creates a batch of distinct briefs with production prompts", async () => {
    const provider = new MockBriefGenerationProvider();
    const result = await provider.generate({
      opportunity: {
        keyword: "healthy meal planning",
        targetRegion: "Indonesia",
        type: "evergreen",
        scoreExplanation: "Commercial intent is the strongest signal.",
      },
      count: 4,
    });
    expect(result).toHaveLength(4);
    expect(new Set(result.map((item) => item.name)).size).toBe(4);
    expect(new Set(result.map((item) => item.orientation)).size).toBeGreaterThan(1);
    expect(result.every((item) => item.generationPrompt.length > 40)).toBe(true);
    expect(result.every((item) => item.negativePrompt.includes("logos"))).toBe(true);
  });
});
