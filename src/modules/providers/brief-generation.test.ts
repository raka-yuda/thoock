import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MockBriefGenerationProvider,
  OpenAIBriefGenerationProvider,
} from "./brief-generation";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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

describe("OpenAIBriefGenerationProvider", () => {
  it("requests strict structured briefs through the Responses API", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_TEXT_MODEL", "test-text-model");
    const brief = {
      name: "Remote work reset",
      targetBuyer: "Workplace teams",
      intendedUsage: "Website banner",
      targetMarket: "Indonesia",
      mainSubject: "Professional taking a calm screen break",
      supportingSubjects: "desk, plant, water glass",
      environment: "Contemporary home office",
      visualStyle: "Natural commercial lifestyle photography",
      orientation: "horizontal",
      composition: "Subject on right third",
      copySpaceLocation: "left",
      lighting: "Soft daylight",
      mood: "Calm and credible",
      representationNotes: "Authentic local representation",
      prohibitedElements: "logos, trademarks, legible text",
      generationPrompt: "A natural commercial photograph of a professional taking a calm screen break in a contemporary home office with copy space on the left.",
      negativePrompt: "logos, trademarks, legible text",
      rationale: "Useful for workplace wellness communication.",
      metadataTitle: "Professional taking a calm home office break",
      metadataCategory: "Business",
      metadataKeywords: "professional|break|home office|wellness|work",
      metadataLanguage: "en",
      metadataFictionalPeopleProperty: true,
      metadataNotes: "Review representation before export.",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "resp_brief",
        output_text: JSON.stringify({ briefs: [brief] }),
      }),
    );

    const result = await new OpenAIBriefGenerationProvider().generate({
      opportunity: {
        keyword: "remote work wellness",
        targetRegion: "Indonesia",
        type: "evergreen",
        scoreExplanation: "Strong commercial intent",
      },
      count: 1,
    });

    expect(result).toEqual([brief]);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      model: "test-text-model",
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "commercial_stock_briefs",
          strict: true,
        },
      },
    });
  });

  it("enforces an explicit orientation preset on every returned brief", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const horizontalBrief = {
      name: "Mobile wellness reminder",
      targetBuyer: "Wellness app teams",
      intendedUsage: "Mobile advertisement",
      targetMarket: "Indonesia",
      mainSubject: "Professional taking a short mindful break",
      supportingSubjects: "phone, desk, plant",
      environment: "Contemporary home office",
      visualStyle: "Natural commercial lifestyle photography",
      orientation: "horizontal",
      composition: "Subject in the lower two thirds with clean space above",
      copySpaceLocation: "upper third",
      lighting: "Soft daylight",
      mood: "Calm and credible",
      representationNotes: "Authentic local representation",
      prohibitedElements: "logos, trademarks, legible text",
      generationPrompt:
        "A natural commercial photograph of a professional taking a short mindful break in a contemporary home office with clean copy space above.",
      negativePrompt: "logos, trademarks, legible text",
      rationale: "Useful for a mobile workplace wellness campaign.",
      metadataTitle: "Professional taking a mindful work break",
      metadataCategory: "Business",
      metadataKeywords: "professional|break|wellness|home office|mobile",
      metadataLanguage: "en",
      metadataFictionalPeopleProperty: true,
      metadataNotes: "Review representation before export.",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "resp_vertical_briefs",
        output_text: JSON.stringify({
          briefs: [
            horizontalBrief,
            {
              ...horizontalBrief,
              name: "Mobile wellness reminder with outdoor break",
              orientation: "square",
            },
          ],
        }),
      }),
    );

    const result = await new OpenAIBriefGenerationProvider().generate({
      opportunity: {
        keyword: "workplace wellness",
        targetRegion: "Indonesia",
        type: "evergreen",
        scoreExplanation: "Strong commercial intent",
      },
      count: 2,
      preset: "Vertical mobile advertisement",
    });

    expect(result).toHaveLength(2);
    expect(result.every((brief) => brief.orientation === "vertical")).toBe(true);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(
      request.text.format.schema.properties.briefs.items.properties.orientation
        .enum,
    ).toEqual(["vertical"]);
  });

  it("keeps the requested batch when OpenAI returns surplus valid briefs", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const brief = {
      name: "Remote work reset",
      targetBuyer: "Workplace teams",
      intendedUsage: "Website banner",
      targetMarket: "Indonesia",
      mainSubject: "Professional taking a calm screen break",
      supportingSubjects: "desk, plant, water glass",
      environment: "Contemporary home office",
      visualStyle: "Natural commercial lifestyle photography",
      orientation: "horizontal",
      composition: "Subject on right third",
      copySpaceLocation: "left",
      lighting: "Soft daylight",
      mood: "Calm and credible",
      representationNotes: "Authentic local representation",
      prohibitedElements: "logos, trademarks, legible text",
      generationPrompt:
        "A natural commercial photograph of a professional taking a calm screen break in a contemporary home office with copy space on the left.",
      negativePrompt: "logos, trademarks, legible text",
      rationale: "Useful for workplace wellness communication.",
      metadataTitle: "Professional taking a calm home office break",
      metadataCategory: "Business",
      metadataKeywords: "professional|break|home office|wellness|work",
      metadataLanguage: "en",
      metadataFictionalPeopleProperty: true,
      metadataNotes: "Review representation before export.",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "resp_surplus_briefs",
        output_text: JSON.stringify({
          briefs: Array.from({ length: 11 }, (_, index) => ({
            ...brief,
            name: `${brief.name} ${index + 1}`,
          })),
        }),
      }),
    );

    const result = await new OpenAIBriefGenerationProvider().generate({
      opportunity: {
        keyword: "remote work wellness",
        targetRegion: "Indonesia",
        type: "evergreen",
        scoreExplanation: "Strong commercial intent",
      },
      count: 10,
    });

    expect(result).toHaveLength(10);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.text.format.schema.properties.briefs).toMatchObject({
      minItems: 10,
      maxItems: 10,
    });
  });
});
