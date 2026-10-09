import { describe, expect, it } from "vitest";
import { isMockModeEnabled, resolveRuntimeConfig } from "./runtime-config";

describe("runtime provider configuration", () => {
  it("keeps mock mode enabled when the value is absent or true", () => {
    expect(isMockModeEnabled(undefined)).toBe(true);
    expect(isMockModeEnabled("true")).toBe(true);
  });

  it("disables mock mode case-insensitively", () => {
    expect(isMockModeEnabled("false")).toBe(false);
    expect(isMockModeEnabled(" FALSE ")).toBe(false);
  });

  it("prefers configured live providers when mock mode is disabled", () => {
    expect(
      resolveRuntimeConfig({
        MOCK_MODE: "false",
        OPENAI_API_KEY: "openai-key",
        GEMINI_API_KEY: "gemini-key",
      }),
    ).toEqual({
      mockMode: false,
      defaultResearchProvider: "openai-research-ai",
      defaultBriefProvider: "openai-brief-ai",
      defaultPromptProvider: "openai-prompt",
      defaultMetadataProvider: "openai-metadata",
    });
  });

  it("falls back safely when no live provider is configured", () => {
    expect(
      resolveRuntimeConfig({
        MOCK_MODE: "false",
        OPENAI_API_KEY: "",
        GEMINI_API_KEY: "",
      }),
    ).toEqual({
      mockMode: false,
      defaultResearchProvider: "mock-research-ai",
      defaultBriefProvider: "mock-brief-ai",
      defaultPromptProvider: "mock-prompt",
      defaultMetadataProvider: "brief-metadata",
    });
  });
});
