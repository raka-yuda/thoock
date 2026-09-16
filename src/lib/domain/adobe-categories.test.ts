import { describe, expect, it } from "vitest";
import {
  ADOBE_STOCK_CATEGORIES,
  normalizeAdobeCategory,
} from "./adobe-categories";

describe("Adobe Stock categories", () => {
  it("matches the 21 current Contributor portal labels in order", () => {
    expect(ADOBE_STOCK_CATEGORIES.map((item) => item.label)).toEqual([
      "Animals",
      "Buildings and Architecture",
      "Business",
      "Drinks",
      "The Environment",
      "States of Mind",
      "Food",
      "Graphic Resources",
      "Hobbies and Leisure",
      "Industry",
      "Landscapes",
      "Lifestyle",
      "People",
      "Plants and Flowers",
      "Culture and Religion",
      "Science",
      "Social Issues",
      "Sports",
      "Technology",
      "Transport",
      "Travel",
    ]);
    expect(ADOBE_STOCK_CATEGORIES).toHaveLength(21);
  });

  it("normalizes legacy labels and portal keys to Adobe CSV category codes", () => {
    expect(normalizeAdobeCategory("Business")).toBe("3");
    expect(normalizeAdobeCategory("10162")).toBe("3");
    expect(normalizeAdobeCategory("Landscape")).toBe("11");
    expect(normalizeAdobeCategory("21")).toBe("21");
    expect(normalizeAdobeCategory("Unknown category")).toBeNull();
  });
});
