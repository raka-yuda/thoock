export type ReviewMetadata = {
  filename: string;
  title: string;
  category: string;
  language: string;
  keywords: string[];
  generativeAi: boolean;
  fictionalPeopleProperty: boolean;
  internalNotes: string;
  validationErrors: string[];
};

export type ReviewAsset = {
  id: string;
  generationJobId: string;
  sourceUrl: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  originalFilename: string;
  mimeType: string;
  width: number;
  height: number;
  megapixels: string;
  fileSize: number;
  checksum: string;
  perceptualHash: string;
  hasMetadata: boolean;
  upscaleStatus: string;
  briefId: string;
  briefName: string;
  prompt: string;
  negativePrompt: string;
  provider: string;
  model: string;
  strategy: string;
  resolution: string;
  quality: string | null;
  aspectRatio: string;
  seed: number | null;
  modelCapabilitySnapshot: { id?: string };
  candidateCount: number;
  estimatedGenerationCostUsd: string;
  generationCostUsd: string | null;
  original?: {
    sourceUrl: string;
    thumbnailUrl: string;
    previewUrl: string;
    mimeType: string;
    width: number;
    height: number;
    megapixels: string;
    fileSize: number;
    checksum: string;
  };
  logoRemoval?: {
    status:
      | "not_required"
      | "pending"
      | "processing"
      | "completed"
      | "failed";
    method: string | null;
    derivedAssetId: string | null;
    error: string | null;
  };
  review: {
    decision: "pending" | "approved" | "rejected" | "regenerate";
    notes: string;
    reviewedAt: string | null;
  };
  metadata: ReviewMetadata | null;
};

export function reviewThumbnailUrl(asset: ReviewAsset, width: 320 | 640 = 640) {
  return `${asset.sourceUrl}${asset.sourceUrl.includes("?") ? "&" : "?"}width=${width}`;
}

export function reviewPreviewUrl(asset: ReviewAsset) {
  return asset.previewUrl ?? `${asset.sourceUrl}?width=1600`;
}

export function reviewLogoRemoval(
  asset: ReviewAsset,
): NonNullable<ReviewAsset["logoRemoval"]> {
  return (
    asset.logoRemoval ?? {
      status: "not_required",
      method: null,
      derivedAssetId: null,
      error: null,
    }
  );
}
