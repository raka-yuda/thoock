import { describe, expect, it } from "vitest";
import type { AssetMetadata } from "./metadata";
import { generateAdobeCsv } from "./export";
describe("Adobe CSV", () => {
  it("creates UTF-8 CSV with exact columns and ordered keywords", () => {
    const csv = generateAdobeCsv([
      {
        filename: "remote-work.jpg",
        title: "Calm professional at a home workspace",
        category: "3",
        language: "en",
        keywords: [
          "remote work",
          "home office",
          "professional",
          "wellness",
          "copy space",
        ],
        generativeAi: true,
        fictionalPeopleProperty: true,
      },
    ]);
    expect(csv).toContain("Filename,Title,Keywords,Category,Releases");
    expect(csv).toContain(
      '"remote,work,home,office,professional,wellness,copy,space"',
    );
    expect(csv).toContain(",3,");
  });
  it("rejects a category label at the final CSV boundary", () => {
    const metadata = {
      filename: "remote-work.jpg",
      title: "Calm professional at a home workspace",
      category: "Business",
      language: "en",
      keywords: [
        "remote work",
        "home office",
        "professional",
        "wellness",
        "copy space",
      ],
      generativeAi: true,
      fictionalPeopleProperty: true,
    } as unknown as AssetMetadata;
    expect(() => generateAdobeCsv([metadata])).toThrow(
      "invalid metadata",
    );
  });
});
