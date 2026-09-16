import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const validCsv = [
  "keyword,target_region,type,target_event_date,competition_estimate,trend_growth,commercial_intent,seasonality,portfolio_performance,research_notes,buyer_use_cases,research_sources",
  "Useful local home workspace,Indonesia,evergreen,,24000,68,82,55,50,Commercially reusable,HR teams|technology brands,https://example.test/source",
].join("\n");

describe("research opportunity CSV import route", () => {
  beforeAll(() => {
    process.env.AUTH_BYPASS = "true";
  });
  afterAll(() => {
    delete process.env.AUTH_BYPASS;
  });

  it("downloads the exact research CSV template", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "stock-research-template.csv",
    );
    expect(await response.text()).toContain(
      "keyword,target_region,type,target_event_date",
    );
  });

  it("previews scores without requiring database access", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/opportunities/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: validCsv, commit: false }),
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      valid: true,
      rowCount: 1,
      rows: [
        {
          keyword: "Useful local home workspace",
          targetRegion: "Indonesia",
          competitionEstimate: 24000,
        },
      ],
    });
    expect(payload.data.rows[0].score).toBeGreaterThan(0);
  });

  it("blocks nonnumeric research evidence before persistence", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/opportunities/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commit: true,
          csv: validCsv.replace("24000", "Manual check required"),
        }),
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.data.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "competition_estimate", row: 2 }),
      ]),
    );
  });
});
