// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { pushUrlFilters, readUrlFilter, urlFilterCount } from "./url-filters";

describe("URL-backed workspace filters", () => {
  beforeEach(() => window.history.replaceState(null, "", "/opportunities"));

  it("writes active filters and removes cleared or all values", () => {
    pushUrlFilters({ status: "shortlisted", from: "2026-08-01", type: "all" });
    expect(window.location.search).toBe("?status=shortlisted&from=2026-08-01");
    expect(readUrlFilter("status")).toBe("shortlisted");

    pushUrlFilters({ status: null, to: "2026-08-31" });
    expect(window.location.search).toBe("?from=2026-08-01&to=2026-08-31");
  });

  it("notifies subscribers and counts only active values", () => {
    const listener = vi.fn();
    window.addEventListener("thoock:urlchange", listener);
    pushUrlFilters({ provider: "snapgen" });
    expect(listener).toHaveBeenCalledOnce();
    expect(urlFilterCount(["all", "snapgen", "", false, "failed"])).toBe(2);
    window.removeEventListener("thoock:urlchange", listener);
  });
});
