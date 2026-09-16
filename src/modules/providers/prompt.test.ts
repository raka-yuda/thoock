import { describe, expect, it } from "vitest";
import { DeterministicPromptProvider } from "./prompt";

const brief = {
  name: "Calm remote-work reset",
  targetBuyer: "workplace wellness teams",
  intendedUsage: "website hero banners",
  targetMarket: "Southeast Asia",
  mainSubject: "a professional taking a mindful break",
  supportingSubjects: "laptop, water glass, indoor plant",
  environment: "a contemporary home office",
  visualStyle: "natural commercial lifestyle photograph",
  orientation: "horizontal",
  composition: "subject on the right third",
  copySpaceLocation: "on the left",
  lighting: "soft morning window light",
  mood: "calm and capable",
  representationNotes: "authentic Southeast Asian adult",
  prohibitedElements: "branded devices, medical claims",
};

describe("commercial prompt generation", () => {
  it("turns a structured brief into editable positive and negative prompts", async () => {
    const result = await new DeterministicPromptProvider().generate(brief);
    expect(result.prompt).toContain("website hero banners");
    expect(result.prompt).toContain("copy space on the left");
    expect(result.negativePrompt).toContain("branded devices");
    expect(result.rationale).toContain("intended buyer");
  });
});
