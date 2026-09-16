import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { resolveDateRange } from "@/lib/domain/date-range";
import { buildBriefUpdatedAtConditions } from "./list-filters";

describe("brief list date filtering", () => {
  it("filters the same updated timestamp shown in the brief table", () => {
    const conditions = buildBriefUpdatedAtConditions(
      resolveDateRange("2026-09-09", "2026-09-10"),
    );
    const query = new PgDialect().sqlToQuery(and(...conditions)!);

    expect(query.sql).toContain('"commercial_briefs"."updated_at"');
    expect(query.sql).not.toContain('"commercial_briefs"."created_at"');
  });
});
