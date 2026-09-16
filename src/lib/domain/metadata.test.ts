import { describe, expect, it } from "vitest";
import {
  findProhibitedTerms,
  normalizeFilename,
  normalizeKeywords,
  validateAdobeMetadata,
} from "./metadata";
describe("Adobe metadata", () => {
  it("normalizes a filename to at most 30 characters", () => {
    const value = normalizeFilename(
      "A Very Long Café Photograph With Private Data.PNG",
    );
    expect(value).toMatch(/^[a-z0-9-]+\.jpg$/);
    expect(value.length).toBeLessThanOrEqual(30);
  });
  it("deduplicates keywords while preserving first relevance order", () =>
    expect(
      normalizeKeywords("wellness, office, Wellness, person, copy space"),
    ).toEqual(["wellness", "office", "person", "copy", "space"]));
  it("turns keyword phrases into ordered individual words", () =>
    expect(normalizeKeywords(["happy house", "man", "travel", "Happy"])).toEqual([
      "happy",
      "house",
      "man",
      "travel",
    ]));
  it("keeps meaningful descriptors and actions while removing filler words", () =>
    expect(
      normalizeKeywords(
        "happy man traveling in a modern house with family and friends for summer",
      ),
    ).toEqual([
      "happy",
      "man",
      "traveling",
      "modern",
      "house",
      "family",
      "friends",
      "summer",
    ]));
  it("detects configured prohibited terms", () =>
    expect(findProhibitedTerms("A Disney style prompt")).toContain("disney"));
  it("validates Adobe title and keyword limits", () => {
    const valid = validateAdobeMetadata({
      filename: "remote-work.jpg",
      title: "Professional working from a calm home office",
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
    });
    expect(valid.valid).toBe(true);
    const invalid = validateAdobeMetadata({
      filename: "remote-work.jpg",
      title: "Generative AI prompt in 4K",
      category: "3",
      language: "en",
      keywords: ["one", "two", "three", "four", "five"],
      generativeAi: true,
      fictionalPeopleProperty: false,
    });
    expect(invalid.valid).toBe(false);
  });
  it("rejects category labels and unknown values because Adobe CSV requires a category number", () => {
    const base = {
      filename: "remote-work.jpg",
      title: "Professional working from a calm home office",
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
    };
    expect(validateAdobeMetadata({ ...base, category: "Business" }).valid).toBe(
      false,
    );
    expect(validateAdobeMetadata({ ...base, category: "22" }).valid).toBe(
      false,
    );
    expect(validateAdobeMetadata({ ...base, category: "3" }).valid).toBe(true);
  });
});
