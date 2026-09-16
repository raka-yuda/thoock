import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfiguredModelCatalog } from "./model-catalog.server";

describe("server model catalog configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("enables Cloudflare Worker models only with endpoint, key, and owner-supplied estimate", async () => {
    vi.stubEnv("MODEL_CATALOG_SOURCE", "defaults");
    vi.stubEnv(
      "CLOUDFLARE_WORKER_AI_URL",
      "https://stock-images.example.workers.dev/",
    );
    vi.stubEnv("CLOUDFLARE_WORKER_AI_API_KEY", "worker-secret");
    vi.stubEnv(
      "CLOUDFLARE_WORKER_AI_ESTIMATED_COST_USD_PER_IMAGE",
      "0.0042",
    );

    const cloudflare = (await loadConfiguredModelCatalog()).filter(
      (item) => item.providerId === "cloudflare-workers-ai",
    );
    expect(cloudflare.length).toBeGreaterThan(0);
    expect(cloudflare.every((item) => item.enabled)).toBe(true);
    expect(
      cloudflare.every((item) => item.generationPriceUsd === 0.0042),
    ).toBe(true);
  });

  it("keeps Cloudflare Worker models blocked when the cost estimate is absent", async () => {
    vi.stubEnv("MODEL_CATALOG_SOURCE", "defaults");
    vi.stubEnv(
      "CLOUDFLARE_WORKER_AI_URL",
      "https://stock-images.example.workers.dev/",
    );
    vi.stubEnv("CLOUDFLARE_WORKER_AI_API_KEY", "worker-secret");
    vi.stubEnv("CLOUDFLARE_WORKER_AI_ESTIMATED_COST_USD_PER_IMAGE", "");

    const cloudflare = (await loadConfiguredModelCatalog()).filter(
      (item) => item.providerId === "cloudflare-workers-ai",
    );
    expect(cloudflare.every((item) => !item.enabled)).toBe(true);
  });

  it("activates documented SnapGen capabilities when its base URL and key are configured", async () => {
    vi.stubEnv("MODEL_CATALOG_SOURCE", "defaults");
    vi.stubEnv("SNAPGEN_API_BASE_URL", "https://api.snapgen.example/");
    vi.stubEnv("SNAPGEN_API_KEY", "snapgen-secret");

    const snapgen = (await loadConfiguredModelCatalog()).filter(
      (item) => item.providerId === "snapgen",
    );
    expect(snapgen.length).toBeGreaterThan(0);
    expect(snapgen.every((item) => item.enabled)).toBe(true);
    expect(
      snapgen
        .filter((item) => item.providerModelId !== "grok-image")
        .every(
        (item) =>
          item.supportedResolutions[0]?.id === "1K" &&
          item.supportedResolutions[1]?.id === "2K" &&
          item.supportedResolutions[2]?.id === "4K" &&
          item.supportedAspectRatios.includes("1:1") &&
          item.generationPriceUsd === null,
      ),
    ).toBe(true);
    expect(
      snapgen.find((item) => item.providerModelId === "grok-image"),
    ).toMatchObject({
      displayName: "Grok Image",
      supportedAspectRatios: ["landscape", "portrait", "square"],
      supportedQualityLevels: ["SPEED", "QUALITY"],
      supportsReferenceImages: true,
      generationPriceUsd: null,
    });
    expect(
      snapgen.find((item) => item.providerModelId === "gpt-image-2-high"),
    ).toMatchObject({
      supportedQualityLevels: ["high"],
      supportsReferenceImages: true,
    });
    expect(
      snapgen.find((item) => item.providerModelId === "gpt-image-2-high")
        ?.supportedAspectRatios,
    ).toContain("21:9");
  });
});
