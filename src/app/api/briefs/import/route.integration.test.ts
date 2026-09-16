import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("commercial brief CSV import route", () => {
  beforeAll(() => {
    process.env.AUTH_BYPASS = "true";
  });
  afterAll(() => {
    delete process.env.AUTH_BYPASS;
  });

  it("downloads the supported CSV header template", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "commercial-briefs-template.csv",
    );
    expect(await response.text()).toContain("name,target_buyer");
  });

  it("previews valid rows without requiring database access", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/briefs/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commit: false,
          csv: "name,main_subject,orientation,candidate_count\nUseful home office,Professional organizing a calm workspace,horizontal,1",
        }),
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      valid: true,
      rowCount: 1,
      rows: [
        {
          name: "Useful home office",
          orientation: "horizontal",
          candidateCount: 1,
        },
      ],
    });
  });

  it("returns row-specific errors before any import", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/briefs/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commit: true,
          csv: "name,main_subject,orientation\nA,x,wide",
        }),
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.data.valid).toBe(false);
    expect(payload.data.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: "orientation" }),
      ]),
    );
  });
});
