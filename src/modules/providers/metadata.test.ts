import { afterEach, describe, expect, it, vi } from "vitest";
import { BriefMetadataProvider, OpenAIMetadataProvider } from "./metadata";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("BriefMetadataProvider", () => {
  it("creates asset metadata entirely from the saved brief plan", async () => {
    const provider = new BriefMetadataProvider();
    const metadata = await provider.generate({
      briefName: "Urban cycling commute",
      prompt: "A professional cycling through a modern city",
      filenameHint: "9db4a89e-urban-cycling-commute",
      briefPlan: {
        title: "Healthy urban commute for modern professionals",
        category: "Transport",
        language: "en",
        keywords: [
          "commute",
          "cycling",
          "and",
          "professional",
          "urban",
          "sustainable",
        ],
        fictionalPeopleProperty: true,
        notes: "Created with a chat-agent metadata plan.",
      },
    });

    expect(metadata).toMatchObject({
      title: "Healthy urban commute for modern professionals",
      category: "20",
      language: "en",
      keywords: [
        "commute",
        "cycling",
        "professional",
        "urban",
        "sustainable",
      ],
      generativeAi: true,
      fictionalPeopleProperty: true,
    });
    expect(metadata.filename).toMatch(/\.jpg$/);
  });

  it("refuses to invent missing metadata plan values", async () => {
    const provider = new BriefMetadataProvider();
    await expect(
      provider.generate({
        briefName: "Incomplete brief",
        prompt: "A useful commercial image",
        filenameHint: "incomplete",
        briefPlan: {
          title: "",
          category: "",
          language: "en",
          keywords: [],
          fictionalPeopleProperty: false,
          notes: "",
        },
      }),
    ).rejects.toThrow(/Complete the brief metadata title/);
  });
});

describe("OpenAIMetadataProvider", () => {
  it("normalizes a structured OpenAI metadata draft", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "resp_metadata",
        output_text: JSON.stringify({
          title: "Professional taking a mindful home office break",
          category: "Business",
          keywords: [
            "professional",
            "wellness",
            "office",
            "break",
            "productivity",
          ],
          fictionalPeopleProperty: true,
        }),
      }),
    );

    const result = await new OpenAIMetadataProvider().generate({
      briefName: "Mindful office break",
      prompt: "Professional taking a break in a home office",
      filenameHint: "mindful-office-break",
    });

    expect(result).toMatchObject({
      category: "3",
      generativeAi: true,
      fictionalPeopleProperty: true,
    });
    expect(result.keywords).toHaveLength(5);
  });
});
