import { describe, expect, it } from "vitest";
import { BriefMetadataProvider } from "./metadata";

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
