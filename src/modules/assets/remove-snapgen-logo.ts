import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assetMetadata,
  derivedAssets,
  generatedAssets,
} from "@/db/schema";
import { prepareCanonicalJpeg } from "./canonical-image";
import { observeProviderLogoRemoval } from "@/modules/providers/request-observability";
import { SnapGenLogoRemovalProvider } from "@/modules/providers/snapgen-logo-removal";
import { LocalStorageProvider } from "@/modules/providers/storage";
import { warmReviewThumbnail } from "./image-variant-cache";

export type RemoveSnapgenLogoInput = {
  assetId: string;
  generationJobId: string;
  model: string;
  historyUuid: string;
  idempotencyKey: string;
  sourcePath: string;
};

export async function removeSnapgenLogo(input: RemoveSnapgenLogoInput) {
  const db = getDb();
  const asset = await db.query.generatedAssets.findFirst({
    where: eq(generatedAssets.id, input.assetId),
    columns: { id: true, activeDerivedAssetId: true },
  });
  if (!asset) throw new Error("The generated image no longer exists.");

  const activeDerived = asset.activeDerivedAssetId
    ? await db.query.derivedAssets.findFirst({
        where: and(
          eq(derivedAssets.id, asset.activeDerivedAssetId),
          eq(derivedAssets.sourceAssetId, input.assetId),
          eq(derivedAssets.type, "logo_removed"),
        ),
      })
    : null;
  const existing =
    activeDerived ??
    (await db.query.derivedAssets.findFirst({
      where: and(
        eq(derivedAssets.sourceAssetId, input.assetId),
        eq(derivedAssets.type, "logo_removed"),
      ),
      orderBy: [desc(derivedAssets.createdAt)],
    }));
  if (existing) {
    await warmReviewThumbnail({
      storage: new LocalStorageProvider(),
      storageKey: existing.storageKey,
    });
    await db
      .update(generatedAssets)
      .set({
        activeDerivedAssetId: existing.id,
        logoRemovalStatus: "completed",
        logoRemovalError: null,
        updatedAt: new Date(),
      })
      .where(eq(generatedAssets.id, input.assetId));
    return existing;
  }

  await db
    .update(generatedAssets)
    .set({
      logoRemovalStatus: "processing",
      logoRemovalError: null,
      updatedAt: new Date(),
    })
    .where(eq(generatedAssets.id, input.assetId));

  try {
    const provider = new SnapGenLogoRemovalProvider();
    const cleaned = await observeProviderLogoRemoval(
      {
        generationJobId: input.generationJobId,
        sourcePath: input.sourcePath,
        idempotencyKey: input.idempotencyKey,
        model: input.model,
        historyUuid: input.historyUuid,
        providerRequest: provider.normalizeRequest(input.historyUuid, "fast"),
      },
      () => provider.remove(input.historyUuid, "fast"),
    );
    const canonical = await prepareCanonicalJpeg(cleaned.buffer);
    const inspection = canonical.prepared;
    const version = randomUUID().slice(0, 12);
    const storageKey = `derived/${input.assetId}/logo-removed-${version}.jpg`;
    const storage = new LocalStorageProvider();
    await storage.put(storageKey, canonical.buffer, canonical.mimeType);
    await warmReviewThumbnail({
      storage,
      storageKey,
      source: canonical.buffer,
    });
    const derived = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(derivedAssets)
        .values({
          sourceAssetId: input.assetId,
          type: "logo_removed",
          provider: "snapgen",
          method: cleaned.mode,
          storageKey,
          width: inspection.width,
          height: inspection.height,
          megapixels: String(inspection.megapixels),
          mimeType: canonical.mimeType,
          fileSize: inspection.fileSize,
          checksum: inspection.checksum,
          perceptualHash: inspection.perceptualHash,
          mayReinterpretDetail: false,
        })
        .returning();
      await tx
        .update(generatedAssets)
        .set({
          activeDerivedAssetId: created.id,
          logoRemovalStatus: "completed",
          logoRemovalError: null,
          updatedAt: new Date(),
        })
        .where(eq(generatedAssets.id, input.assetId));
      await tx
        .update(assetMetadata)
        .set({ preparedAssetId: null, updatedAt: new Date() })
        .where(eq(assetMetadata.generatedAssetId, input.assetId));
      return created;
    });
    return derived;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SnapGenAI logo removal failed.";
    await db
      .update(generatedAssets)
      .set({
        logoRemovalStatus: "failed",
        logoRemovalError: message.slice(0, 4_000),
        updatedAt: new Date(),
      })
      .where(eq(generatedAssets.id, input.assetId));
    throw error;
  }
}
