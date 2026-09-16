import { describe, expect, it } from "vitest";
import { formatAppDateTime } from "./date";

describe("formatAppDateTime", () => {
  it("uses one readable date and time format", () => {
    expect(formatAppDateTime("2026-09-12T05:18:12")).toBe(
      "Sep 12, 2026, 5:18:12 AM",
    );
  });

  it("returns a placeholder for missing or invalid dates", () => {
    expect(formatAppDateTime()).toBe("—");
    expect(formatAppDateTime("not-a-date")).toBe("—");
  });
});
