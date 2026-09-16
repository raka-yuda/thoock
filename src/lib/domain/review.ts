export const BASE_REVIEW_CHECKS = [
  "No visible logo or trademark",
  "No unreadable or meaningless text",
  "No obvious anatomy problems",
  "No misleading depiction of a real event",
  "No famous person or fictional character",
  "No obvious copyrighted character or artwork",
  "Composition is commercially useful",
  "Subject and background are visually consistent",
  "Image is sufficiently distinct from other submissions",
] as const;

export const POST_UPSCALE_CHECKS = [
  "Face and skin details remain natural",
  "Hands and anatomy were not altered incorrectly",
  "Text or symbols were not invented",
  "Logos or recognizable marks were not introduced",
  "Background details remain consistent",
  "Texture does not look excessively sharpened",
  "No halos or edge artifacts",
  "No new objects were hallucinated",
  "Image remains faithful to the selected original",
  "Result is suitable for stock licensing",
] as const;

export function isSubmissionReady(input: {
  baseChecks: boolean[];
  metadataValid: boolean;
  megapixels: number;
  postUpscaleRequired: boolean;
  postUpscaleChecks?: boolean[];
  minimumMegapixels?: number;
}) {
  return (
    input.megapixels >= (input.minimumMegapixels ?? 4) &&
    input.metadataValid &&
    input.baseChecks.every(Boolean) &&
    (!input.postUpscaleRequired ||
      Boolean(input.postUpscaleChecks?.every(Boolean)))
  );
}
