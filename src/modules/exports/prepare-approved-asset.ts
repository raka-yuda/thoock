import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assetMetadata,
  assetReviews,
  derivedAssets,
  generatedAssets,
  generationJobs,
  qualityChecks,
} from "@/db/schema";
import { normalizeAdobeCategory } from "@/lib/domain/adobe-categories";
import {
  normalizeKeywords,
  validateAdobeMetadata,
  type AssetMetadata,
} from "@/lib/domain/metadata";
import { BASE_REVIEW_CHECKS } from "@/lib/domain/review";
import { inspectImage } from "@/modules/assets/inspect";
import { prepareAdobeJpeg, validatePreparedJpeg } from "@/modules/assets/prepare";
import { LocalStorageProvider } from "@/modules/providers/storage";
import { isSnapgenNanoModel } from "@/modules/providers/snapgen-logo-removal";
import type { ExportItem } from "./create-batch";

export async function prepareApprovedAssetForExport(
  assetId: string,
  minimumMegapixels = 4,
): Promise<ExportItem> {
  const db = getDb();
  const asset = await db.query.generatedAssets.findFirst({
    where: eq(generatedAssets.id, assetId),
  });
  if (!asset) throw new Error("The selected image no longer exists.");

  const review = await db.query.assetReviews.findFirst({
    where: eq(assetReviews.generatedAssetId, asset.id),
    orderBy: [desc(assetReviews.createdAt)],
  });
  if (!review || review.decision !== "approved")
    throw new Error(`${asset.originalFilename} has not been approved.`);
  const checks = await db
    .select()
    .from(qualityChecks)
    .where(eq(qualityChecks.assetReviewId, review.id));
  const reviewCompleted =
    checks.length >= BASE_REVIEW_CHECKS.length &&
    checks.every((check) => check.passed);
  if (!reviewCompleted)
    throw new Error(`${asset.originalFilename} has incomplete human checks.`);

  const metadataRow = await db.query.assetMetadata.findFirst({
    where: eq(assetMetadata.generatedAssetId, asset.id),
  });
  if (!metadataRow)
    throw new Error(`${asset.originalFilename} does not have metadata.`);
  const category = normalizeAdobeCategory(metadataRow.category);
  if (!category)
    throw new Error(
      `${asset.originalFilename} does not have a valid Adobe Stock category.`,
    );
  const metadata: AssetMetadata = {
    filename: metadataRow.filename,
    title: metadataRow.title,
    category,
    language: metadataRow.language,
    keywords: normalizeKeywords(metadataRow.keywords),
    generativeAi: metadataRow.generativeAi,
    fictionalPeopleProperty: metadataRow.fictionalPeopleProperty,
    internalNotes: metadataRow.internalNotes,
  };
  if (!validateAdobeMetadata(metadata).valid)
    throw new Error(`${metadata.filename} has invalid Adobe metadata.`);

  const storage = new LocalStorageProvider();
  const activeDerivedSource = asset.activeDerivedAssetId
    ? await db.query.derivedAssets.findFirst({
        where: and(
          eq(derivedAssets.id, asset.activeDerivedAssetId),
          eq(derivedAssets.sourceAssetId, asset.id),
        ),
      })
    : null;
  const legacyLogoRemovedSource = activeDerivedSource
    ? null
    : await db.query.derivedAssets.findFirst({
        where: and(
          eq(derivedAssets.sourceAssetId, asset.id),
          eq(derivedAssets.type, "logo_removed"),
        ),
        orderBy: [desc(derivedAssets.createdAt)],
      });
  const canonicalSource = activeDerivedSource ?? legacyLogoRemovedSource;
  const sourceJob = await db.query.generationJobs.findFirst({
    where: eq(generationJobs.id, asset.generationJobId),
  });
  if (
    sourceJob?.provider === "snapgen" &&
    isSnapgenNanoModel(sourceJob.model) &&
    canonicalSource?.type !== "logo_removed"
  )
    throw new Error(
      `${asset.originalFilename} still contains the SnapGen provider mark. Complete Fast logo removal before export.`,
    );
  if (metadataRow.preparedAssetId) {
    const existing = await db.query.derivedAssets.findFirst({
      where: eq(derivedAssets.id, metadataRow.preparedAssetId),
    });
    if (
      existing?.sourceAssetId === asset.id &&
      existing.type === "prepared_jpeg" &&
      (existing.sourceDerivedAssetId ?? null) ===
        (canonicalSource?.id ?? null)
    ) {
      const jpeg = await storage.get(existing.storageKey);
      const inspection = await inspectImage(jpeg);
      const validation = validatePreparedJpeg(
        {
          format: inspection.format,
          megapixels: inspection.megapixels,
          filename: metadata.filename,
        },
        minimumMegapixels,
      );
      if (!validation.valid)
        throw new Error(
          `${metadata.filename} no longer passes final JPEG validation.`,
        );
      return {
        metadata,
        jpeg,
        checksum: inspection.checksum,
        sourceAssetId: asset.id,
        preparedAssetId: existing.id,
        upscaled: false,
        reviewCompleted,
      };
    }
  }

  const source = await storage.get(
    canonicalSource?.storageKey ?? asset.storageKey,
  );
  const prepared = await prepareAdobeJpeg(
    source,
    metadata.filename,
    minimumMegapixels,
  );
  const preparedKey = `prepared/${asset.id}/${prepared.filename}`;
  await storage.put(preparedKey, prepared.buffer, "image/jpeg");
  const [derived] = await db
    .insert(derivedAssets)
    .values({
      sourceAssetId: asset.id,
      sourceDerivedAssetId: canonicalSource?.id,
      type: "prepared_jpeg",
      provider: "sharp",
      method: "orientation-srgb-jpeg",
      storageKey: preparedKey,
      width: prepared.prepared.width,
      height: prepared.prepared.height,
      megapixels: String(prepared.prepared.megapixels),
      mimeType: "image/jpeg",
      fileSize: prepared.prepared.fileSize,
      checksum: prepared.prepared.checksum,
      perceptualHash: prepared.prepared.perceptualHash,
      mayReinterpretDetail: false,
    })
    .returning();
  await db
    .update(assetMetadata)
    .set({
      preparedAssetId: derived.id,
      filename: prepared.filename,
      keywords: metadata.keywords,
      updatedAt: new Date(),
    })
    .where(eq(assetMetadata.id, metadataRow.id));

  return {
    metadata: { ...metadata, filename: prepared.filename },
    jpeg: prepared.buffer,
    checksum: prepared.prepared.checksum,
    sourceAssetId: asset.id,
    preparedAssetId: derived.id,
    upscaled: false,
    reviewCompleted,
  };
}
