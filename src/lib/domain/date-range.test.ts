import { describe, expect, it } from "vitest";
import { dateOnlySchema, resolveDateRange } from "./date-range";

describe("date range filtering", () => {
  it("rejects impossible calendar dates", () => {
    expect(dateOnlySchema.safeParse("2026-02-29").success).toBe(false);
    expect(dateOnlySchema.safeParse("2026-08-29").success).toBe(true);
  });

  it("includes the complete end date", () => {
    const range = resolveDateRange("2026-08-01", "2026-08-29");
    expect(range.start?.toISOString()).toBe("2026-07-31T17:00:00.000Z");
    expect(range.endExclusive?.toISOString()).toBe("2026-08-29T17:00:00.000Z");
  });

  it("rejects a reversed range", () => {
    expect(() => resolveDateRange("2026-08-30", "2026-08-29")).toThrow(
      "start date",
    );
  });
});
