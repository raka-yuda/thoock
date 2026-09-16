import { describe, expect, it } from "vitest";
import { calculateMegapixels } from "./image";
import { defaultModelCatalog, estimateGenerationCost, getExpectedDimensions, snapshotModelCapability } from "./model-catalog";

describe("model capability catalog", () => {
  it("keeps paid placeholder prices unavailable rather than invented", () => {
    const snapgen = defaultModelCatalog.find((item) => item.id === "snapgen-nano-banana-2")!;
    expect(snapgen.enabled).toBe(false);
    expect(estimateGenerationCost(snapgen, 3)).toBeNull();
  });

  it("provides direct mock targets above the 4.2MP preparation margin for every aspect", () => {
    const direct = defaultModelCatalog.find((item) => item.id === "mock-direct")!;
    for (const aspect of direct.supportedAspectRatios) {
      const dimensions = getExpectedDimensions(direct, "direct-4mp", aspect)!;
      expect(calculateMegapixels(dimensions.width, dimensions.height)).toBeGreaterThanOrEqual(4.2);
    }
  });

  it("snapshots a capability without retaining mutable references", () => {
    const original = defaultModelCatalog[0];
    const snapshot = snapshotModelCapability(original);
    snapshot.displayName = "Historical snapshot";
    expect(original.displayName).not.toBe(snapshot.displayName);
  });

  it("ships Cloudflare Worker models disabled and unpriced until owner configuration is supplied", () => {
    const cloudflare = defaultModelCatalog.filter(
      (item) => item.providerId === "cloudflare-workers-ai",
    );
    expect(cloudflare).toHaveLength(4);
    expect(cloudflare.every((item) => !item.enabled)).toBe(true);
    expect(cloudflare.every((item) => item.generationPriceUsd === null)).toBe(
      true,
    );
    expect(cloudflare[0].supportedResolutions.map((item) => item.id)).toEqual([
      "worker-1024",
      "worker-1536",
      "worker-2048",
    ]);
    expect(
      cloudflare.every(
        (item) =>
          item.supportedQualityLevels.length === 0 &&
          !item.supportsNegativePrompt &&
          !item.supportsSeed,
      ),
    ).toBe(true);
  });
});
