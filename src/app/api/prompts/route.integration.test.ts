import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "./route";

describe("commercial prompt route", () => {
  beforeAll(() => {
    process.env.AUTH_BYPASS = "true";
  });
  afterAll(() => {
    delete process.env.AUTH_BYPASS;
  });

  it("returns an editable prompt from a structured brief in mock mode", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "mock-prompt",
          brief: {
            name: "Remote work reset",
            targetBuyer: "HR teams",
            intendedUsage: "website banners",
            targetMarket: "Indonesia",
            mainSubject: "professional taking a mindful break",
            supportingSubjects: "laptop and indoor plant",
            environment: "home office",
            visualStyle: "natural commercial photograph",
            orientation: "horizontal",
            composition: "subject on right third",
            copySpaceLocation: "left",
            lighting: "soft morning light",
            mood: "calm",
            representationNotes: "Indonesian adult",
            prohibitedElements: "logos and medical claims",
          },
        }),
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.prompt).toContain("website banners");
    expect(payload.data.negativePrompt).toContain("logos");
  });
});
