import "server-only";
import { getDb } from "@/db";
import { generationModelCapabilities } from "@/db/schema";
import {
  defaultModelCatalog,
  type ModelCapability,
} from "@/lib/domain/model-catalog";

function cloudflareQuickStartCatalog(
  catalog: ModelCapability[],
): ModelCapability[] {
  const rawPrice = process.env.CLOUDFLARE_WORKER_AI_ESTIMATED_COST_USD_PER_IMAGE;
  const price = rawPrice?.trim() === "" ? Number.NaN : Number(rawPrice);
  const configured = Boolean(
    process.env.CLOUDFLARE_WORKER_AI_URL &&
      process.env.CLOUDFLARE_WORKER_AI_API_KEY &&
      Number.isFinite(price) &&
      price >= 0,
  );
  if (!configured) return catalog;
  return catalog.map((item) =>
    item.providerId === "cloudflare-workers-ai"
      ? {
          ...item,
          enabled: true,
          generationPriceUsd: price,
          pricingUnit: "image" as const,
        }
      : item,
  );
}

function snapgenQuickStartCatalog(
  catalog: ModelCapability[],
): ModelCapability[] {
  const configured = Boolean(
    process.env.SNAPGEN_API_BASE_URL?.trim() &&
      process.env.SNAPGEN_API_KEY?.trim(),
  );
  if (!configured) return catalog;
  const nanoRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
  const gptRatios = [...nanoRatios, "21:9", "3:2", "2:3"];
  const dimensions = (edge: number, ratios: string[]) =>
    Object.fromEntries(
      ratios.map((ratio) => {
        const [wide, high] = ratio.split(":").map(Number);
        return [
          ratio,
          wide >= high
            ? { width: edge, height: Math.round((edge * high) / wide) }
            : { width: Math.round((edge * wide) / high), height: edge },
        ];
      }),
    );
  const resolutions = (ratios: string[]) =>
    [
      ["1K", 1024],
      ["2K", 2048],
      ["4K", 4096],
    ].map(([id, edge]) => ({
      id: String(id),
      label: `${id} requested (inspect actual output)`,
      expectedDimensions: dimensions(Number(edge), ratios),
    }));
  const grokOrientations = ["landscape", "portrait", "square"];
  const grokProviderDefault = [
    {
      id: "provider-default",
      label: "Provider default (inspect actual output)",
      expectedDimensions: {
        landscape: { width: 1024, height: 768 },
        portrait: { width: 768, height: 1024 },
        square: { width: 1024, height: 1024 },
      },
    },
  ];
  return catalog.map((item) => {
    if (item.providerId !== "snapgen") return item;
    const isGrok = item.providerModelId === "grok-image";
    const isGpt = item.providerModelId.startsWith("gpt-image-2-");
    const quality = item.providerModelId.match(/-(low|medium|high)$/)?.[1];
    const ratios = isGpt ? gptRatios : nanoRatios;
    return {
      ...item,
      enabled: true,
      supportedResolutions: isGrok
        ? grokProviderDefault
        : resolutions(ratios),
      supportedAspectRatios: isGrok ? grokOrientations : ratios,
      supportedQualityLevels: isGrok
        ? ["SPEED", "QUALITY"]
        : isGpt && quality
          ? [quality]
          : [],
      outputFormats: ["jpeg", "png"],
      supportsNegativePrompt: false,
      supportsSeed: false,
      supportsReferenceImages: true,
      generationPriceUsd: null,
      pricingUnit: "unknown" as const,
      commercialTermsReference:
        isGrok
          ? "https://docs.snapgen.ai/resources/1.grok_image"
          : isGpt
            ? "https://docs.snapgen.ai/resources/3.gpt-image-2"
            : "https://docs.snapgen.ai/resources/0.image-generation",
    };
  });
}

/** Environment overrides let a VPS configure paid catalogs before a settings editor is connected to PostgreSQL. */
export async function loadConfiguredModelCatalog(): Promise<ModelCapability[]> {
  const raw = process.env.GENERATION_MODEL_CATALOG_JSON;
  if (raw) {
    try {
      const overrides = JSON.parse(raw) as ModelCapability[];
      if (!Array.isArray(overrides))
        throw new Error("Catalog JSON must be an array.");
      const byId = new Map(defaultModelCatalog.map((item) => [item.id, item]));
      for (const override of overrides) {
        if (!override?.id || !override.providerId || !override.providerModelId)
          throw new Error(
            "Every catalog entry needs id, providerId, and providerModelId.",
          );
        byId.set(override.id, {
          ...(byId.get(override.id) ?? ({} as ModelCapability)),
          ...override,
        });
      }
      return [...byId.values()];
    } catch (error) {
      throw new Error(
        `GENERATION_MODEL_CATALOG_JSON is invalid: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  if (process.env.MODEL_CATALOG_SOURCE !== "database")
    return cloudflareQuickStartCatalog(
      snapgenQuickStartCatalog(defaultModelCatalog),
    );
  const rows = await getDb().select().from(generationModelCapabilities);
  if (!rows.length) return defaultModelCatalog;
  return rows.map((row) => ({
    id: row.id,
    providerId: row.providerId,
    providerModelId: row.providerModelId,
    displayName: row.displayName,
    enabled: row.enabled,
    supportedResolutions: row.supportedResolutions as ModelCapability["supportedResolutions"],
    supportedAspectRatios: row.supportedAspectRatios,
    supportedQualityLevels: row.supportedQualityLevels,
    outputFormats: row.outputFormats,
    supportsNegativePrompt: row.supportsNegativePrompt,
    supportsSeed: row.supportsSeed,
    supportsReferenceImages: row.supportsReferenceImages,
    generationPriceUsd: row.generationPriceUsd === null ? null : Number(row.generationPriceUsd),
    pricingUnit: row.pricingUnit as ModelCapability["pricingUnit"],
    creditCost: row.creditCost === null ? null : Number(row.creditCost),
    commercialUseStatus: row.commercialUseStatus as ModelCapability["commercialUseStatus"],
    commercialTermsReference: row.commercialTermsReference,
    lastPricingVerificationDate: row.lastPricingVerificationDate,
    ...(row.endpointPath ? { endpointPath: row.endpointPath } : {}),
  }));
}
