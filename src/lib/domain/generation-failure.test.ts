import { describe, expect, it } from "vitest";
import { classifyGenerationFailure } from "./generation-failure";

describe("generation failure classification", () => {
  it.each([
    ["Provider returned 429 rate limit", "retryable"],
    ["SnapGenAI history lookup failed with status 524", "retryable"],
    ["fetch failed: network timeout", "retryable"],
    ["Invalid prompt rejected with 422", "edit_required"],
    ["API key is not configured", "configuration"],
    ["Unexpected image inspection problem", "unknown"],
  ] as const)("classifies %s as %s", (message, expected) => {
    expect(classifyGenerationFailure(new Error(message))).toBe(expected);
  });
});
