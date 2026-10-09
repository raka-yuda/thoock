import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { appLogger } from "@/lib/server/logger";
import type { StorageProvider } from "@/modules/providers/contracts";

export const REVIEW_THUMBNAIL_WIDTH = 640;

export function imageVariantIdentity(storageKey: string, width?: number) {
  return `${storageKey}:${width ?? "original"}:v1`;
}

export function imageVariantEtag(storageKey: string, width?: number) {
  return createHash("sha256")
    .update(imageVariantIdentity(storageKey, width))
    .digest("hex");
}

export function imageVariantStorageKey(storageKey: string, width: number) {
  return `cache/thumbnails/${imageVariantEtag(storageKey, width)}.jpg`;
}

export async function getOrCreateImageVariant(input: {
  storage: StorageProvider;
  storageKey: string;
  width: number;
  source?: Buffer;
}) {
  const cacheKey = imageVariantStorageKey(input.storageKey, input.width);
  if (await input.storage.exists(cacheKey)) return input.storage.get(cacheKey);

  const original = input.source ?? (await input.storage.get(input.storageKey));
  const data = await sharp(original)
    .rotate()
    .resize({
      width: input.width,
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .jpeg({ quality: input.width <= 640 ? 72 : 82, mozjpeg: true })
    .toBuffer();
  await input.storage.put(cacheKey, data, "image/jpeg");
  return data;
}

export async function warmReviewThumbnail(input: {
  storage: StorageProvider;
  storageKey: string;
  source?: Buffer;
}) {
  const startedAt = performance.now();
  try {
    await getOrCreateImageVariant({
      ...input,
      width: REVIEW_THUMBNAIL_WIDTH,
    });
    appLogger.debug("asset.thumbnail.warmed", {
      storageKey: input.storageKey,
      width: REVIEW_THUMBNAIL_WIDTH,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
  } catch (error) {
    // A derivative cache miss must never make an otherwise valid asset fail.
    appLogger.warn("asset.thumbnail.warm_failed", {
      storageKey: input.storageKey,
      width: REVIEW_THUMBNAIL_WIDTH,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error,
    });
  }
}
