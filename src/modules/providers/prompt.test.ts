import { afterEach, describe, expect, it, vi } from "vitest";
import { DeterministicPromptProvider, OpenAIPromptProvider } from "./prompt";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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

it("generates a structured prompt with OpenAI", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      id: "resp_prompt",
      output_text: JSON.stringify({
        prompt: "A natural commercial lifestyle photograph of a professional taking a mindful break in a contemporary home office with clean copy space on the left.",
        negativePrompt: "logos, trademarks, malformed hands",
        rationale: "The composition serves workplace wellness campaigns.",
      }),
    }),
  );

  const result = await new OpenAIPromptProvider().generate(brief);

  expect(result.prompt).toContain("commercial lifestyle");
  expect(result.negativePrompt).toContain("logos");
});
