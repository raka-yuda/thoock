export const MIN_MEGAPIXELS = 4;
export const PREPARATION_TARGET_MEGAPIXELS = 4.2;

export function calculateMegapixels(width: number, height: number) {
  return (width * height) / 1_000_000;
}

export function minimumTargetDimensions(
  width: number,
  height: number,
  minimumMegapixels = PREPARATION_TARGET_MEGAPIXELS,
) {
  const currentPixels = width * height;
  const targetPixels = minimumMegapixels * 1_000_000;
  if (currentPixels >= targetPixels) return { width, height, scale: 1 };
  const scale = Math.sqrt(targetPixels / currentPixels);
  return {
    width: Math.ceil(width * scale),
    height: Math.ceil(height * scale),
    scale,
  };
}

export type UpscaleDecision = {
  required: boolean;
  status: "upscale_not_required" | "upscale_required";
  target: ReturnType<typeof minimumTargetDimensions>;
  reason: string;
};

export function decideUpscale(
  width: number,
  height: number,
  minimumMegapixels = MIN_MEGAPIXELS,
  preparationTargetMegapixels = PREPARATION_TARGET_MEGAPIXELS,
): UpscaleDecision {
  const megapixels = calculateMegapixels(width, height);
  const target = minimumTargetDimensions(
    width,
    height,
    preparationTargetMegapixels,
  );
  if (megapixels >= minimumMegapixels) {
    return {
      required: false,
      status: "upscale_not_required",
      target: { width, height, scale: 1 },
      reason: `The original is already at least ${minimumMegapixels}MP.`,
    };
  }
  return {
    required: true,
    status: "upscale_required",
    target,
    reason: `The original is ${megapixels.toFixed(2)}MP. Increase by at least ${target.scale.toFixed(2)}x after human selection.`,
  };
}

export function hammingDistance(left: string, right: string) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const xor =
      Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    distance += xor.toString(2).replaceAll("0", "").length;
  }
  return distance;
}

export function similarityFromHashes(left: string, right: string) {
  const bits = left.length * 4;
  if (!bits) return 0;
  return Math.max(0, 1 - hammingDistance(left, right) / bits);
}

export function isLikelyDuplicate(
  left: string,
  right: string,
  threshold = 0.9,
) {
  return similarityFromHashes(left, right) >= threshold;
}
