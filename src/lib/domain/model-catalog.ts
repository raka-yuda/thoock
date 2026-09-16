export type CommercialUseStatus = "verified" | "unverified" | "restricted";
export type PricingUnit = "image" | "megapixel" | "credit" | "unknown";

export type ResolutionCapability = {
  id: string;
  label: string;
  expectedDimensions: Record<string, { width: number; height: number }>;
};

export type ModelCapability = {
  id: string;
  providerId: string;
  providerModelId: string;
  displayName: string;
  enabled: boolean;
  supportedResolutions: ResolutionCapability[];
  supportedAspectRatios: string[];
  supportedQualityLevels: string[];
  outputFormats: string[];
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
  supportsReferenceImages: boolean;
  generationPriceUsd: number | null;
  pricingUnit: PricingUnit;
  creditCost: number | null;
  commercialUseStatus: CommercialUseStatus;
  commercialTermsReference: string | null;
  lastPricingVerificationDate: string | null;
  endpointPath?: string;
};

const aspectDimensions = (longEdge: number, shortEdge: number) => ({
  "1:1": { width: longEdge, height: longEdge },
  "4:3": { width: longEdge, height: shortEdge },
  "3:4": { width: shortEdge, height: longEdge },
  "16:9": { width: longEdge, height: Math.round((longEdge * 9) / 16) },
  "9:16": { width: Math.round((longEdge * 9) / 16), height: longEdge },
});

const directTargetDimensions = {
  "1:1": { width: 2050, height: 2050 },
  "4:3": { width: 2368, height: 1776 },
  "3:4": { width: 1776, height: 2368 },
  "16:9": { width: 2736, height: 1539 },
  "9:16": { width: 1539, height: 2736 },
};

const configurablePlaceholder = (
  id: string,
  providerId: string,
  providerModelId: string,
  displayName: string,
): ModelCapability => ({
  id,
  providerId,
  providerModelId,
  displayName,
  enabled: false,
  supportedResolutions: [],
  supportedAspectRatios: [],
  supportedQualityLevels: [],
  outputFormats: [],
  supportsNegativePrompt: false,
  supportsSeed: false,
  supportsReferenceImages: false,
  generationPriceUsd: null,
  pricingUnit: "unknown",
  creditCost: null,
  commercialUseStatus: "unverified",
  commercialTermsReference: null,
  lastPricingVerificationDate: null,
});

const cloudflareWorkerCapability = (
  id: string,
  providerModelId: string,
  displayName: string,
): ModelCapability => ({
  ...configurablePlaceholder(
    id,
    "cloudflare-workers-ai",
    providerModelId,
    displayName,
  ),
  supportedResolutions: [
    {
      id: "worker-1024",
      label: "1024px long edge (requested)",
      expectedDimensions: aspectDimensions(1024, 768),
    },
    {
      id: "worker-1536",
      label: "1536px long edge (requested)",
      expectedDimensions: aspectDimensions(1536, 1152),
    },
    {
      id: "worker-2048",
      label: "2048px long edge (requested)",
      expectedDimensions: aspectDimensions(2048, 1536),
    },
  ],
  supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
  supportedQualityLevels: [],
  outputFormats: ["jpeg"],
  supportsNegativePrompt: false,
  supportsSeed: false,
  commercialTermsReference:
    "Owner-controlled Cloudflare Worker; verify the selected Workers AI model terms before stock use.",
});

/** Safe development defaults. Paid-provider entries stay disabled and unpriced until their configuration is verified. */
export const defaultModelCatalog: ModelCapability[] = [
  {
    id: "mock-economical",
    providerId: "mock",
    providerModelId: "mock-economical-v1",
    displayName: "Mock economical placeholder",
    enabled: true,
    supportedResolutions: [
      {
        id: "economical",
        label: "Economical (1.92MP expected)",
        expectedDimensions: aspectDimensions(1600, 1200),
      },
    ],
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    supportedQualityLevels: ["standard"],
    outputFormats: ["jpeg"],
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsReferenceImages: false,
    generationPriceUsd: 0,
    pricingUnit: "image",
    creditCost: 0,
    commercialUseStatus: "verified",
    commercialTermsReference:
      "Development-only placeholder output; do not submit it as stock.",
    lastPricingVerificationDate: null,
  },
  {
    id: "mock-direct",
    providerId: "mock",
    providerModelId: "mock-direct-v1",
    displayName: "Mock direct-compliant placeholder",
    enabled: true,
    supportedResolutions: [
      {
        id: "direct-4mp",
        label: "Direct 4.2MP target",
        expectedDimensions: directTargetDimensions,
      },
    ],
    supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    supportedQualityLevels: ["standard"],
    outputFormats: ["jpeg"],
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsReferenceImages: false,
    generationPriceUsd: 0,
    pricingUnit: "image",
    creditCost: 0,
    commercialUseStatus: "verified",
    commercialTermsReference:
      "Development-only placeholder output; do not submit it as stock.",
    lastPricingVerificationDate: null,
  },
  configurablePlaceholder(
    "snapgen-nano-banana-pro",
    "snapgen",
    "nano-banana-pro",
    "Nano Banana Pro",
  ),
  configurablePlaceholder(
    "snapgen-nano-banana-2",
    "snapgen",
    "nano-banana-2",
    "Nano Banana 2",
  ),
  configurablePlaceholder(
    "snapgen-nano-banana-2-lite",
    "snapgen",
    "nano-banana-2-lite",
    "Nano Banana 2 Lite",
  ),
  configurablePlaceholder(
    "snapgen-grok-image",
    "snapgen",
    "grok-image",
    "Grok Image",
  ),
  configurablePlaceholder(
    "snapgen-gpt-image-2-low",
    "snapgen",
    "gpt-image-2-low",
    "GPT Image 2 — Low",
  ),
  configurablePlaceholder(
    "snapgen-gpt-image-2-medium",
    "snapgen",
    "gpt-image-2-medium",
    "GPT Image 2 — Medium",
  ),
  configurablePlaceholder(
    "snapgen-gpt-image-2-high",
    "snapgen",
    "gpt-image-2-high",
    "GPT Image 2 — High",
  ),
  cloudflareWorkerCapability(
    "cloudflare-flux-1-schnell",
    "@cf/black-forest-labs/flux-1-schnell",
    "FLUX.1 Schnell via Cloudflare Worker",
  ),
  cloudflareWorkerCapability(
    "cloudflare-sdxl-lightning",
    "@cf/bytedance/stable-diffusion-xl-lightning",
    "Stable Diffusion XL Lightning via Cloudflare Worker",
  ),
  cloudflareWorkerCapability(
    "cloudflare-dreamshaper-8-lcm",
    "@cf/lykon/dreamshaper-8-lcm",
    "DreamShaper 8 LCM via Cloudflare Worker",
  ),
  cloudflareWorkerCapability(
    "cloudflare-sdxl-base-1",
    "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    "Stable Diffusion XL Base 1.0 via Cloudflare Worker",
  ),
  configurablePlaceholder(
    "bfl-configured",
    "black-forest-labs",
    "configure-me",
    "Black Forest Labs (configure model)",
  ),
  configurablePlaceholder(
    "gemini-configured",
    "gemini",
    "configure-me",
    "Gemini image (configure model)",
  ),
  {
    ...configurablePlaceholder(
      "imported-image",
      "imported",
      "import",
      "Imported image",
    ),
    enabled: true,
    outputFormats: ["jpeg", "png", "webp"],
    generationPriceUsd: 0,
    pricingUnit: "image",
  },
];

export function getExpectedDimensions(
  capability: ModelCapability,
  resolutionId: string,
  aspectRatio: string,
) {
  return (
    capability.supportedResolutions.find(
      (resolution) => resolution.id === resolutionId,
    )?.expectedDimensions[aspectRatio] ?? null
  );
}

export function estimateGenerationCost(
  capability: ModelCapability,
  candidateCount: number,
): number | null {
  if (
    capability.generationPriceUsd === null ||
    capability.pricingUnit !== "image"
  )
    return null;
  return capability.generationPriceUsd * candidateCount;
}

export function snapshotModelCapability(capability: ModelCapability) {
  return structuredClone(capability);
}
