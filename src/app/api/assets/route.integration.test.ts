import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("asset feed route", () => {
  const databaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.AUTH_BYPASS = "true";
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    delete process.env.AUTH_BYPASS;
    if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
    else delete process.env.DATABASE_URL;
  });

  it("returns a bounded cursor page in demo mode", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/assets?limit=12"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      data: [],
      pagination: { limit: 12, hasMore: false, nextCursor: null },
    });
  });

  it("rejects an unbounded page size", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/assets?limit=5000"),
    );

    expect(response.status).toBe(400);
  });

  it("rejects a malformed cursor before database access", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/assets?cursor=not-a-cursor"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Invalid asset cursor.",
    });
  });
});
