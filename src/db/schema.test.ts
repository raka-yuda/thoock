import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { commercialBriefs, generatedAssets } from "./schema";

describe("commercialBriefs schema", () => {
  it("stores the full copy-space value accepted by the brief domain", () => {
    const column = getTableConfig(commercialBriefs).columns.find(
      (candidate) => candidate.name === "copy_space_location",
    );

    expect(column).toBeDefined();
    expect((column as typeof column & { length?: number }).length).toBe(100);
  });
});

describe("generatedAssets schema", () => {
  it("keeps an explicit pointer to the canonical derived image", () => {
    const column = getTableConfig(generatedAssets).columns.find(
      (candidate) => candidate.name === "active_derived_asset_id",
    );

    expect(column).toBeDefined();
  });
});
