import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { derivedAssets, generatedAssets } from "@/db/schema";
import { inspectImage } from "./inspect";
import { observeProviderLogoRemoval } from "@/modules/providers/request-observability";
import { SnapGenLogoRemovalProvider } from "@/modules/providers/snapgen-logo-removal";
import { LocalStorageProvider } from "@/modules/providers/storage";

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
  const existing = await db.query.derivedAssets.findFirst({
    where: and(
      eq(derivedAssets.sourceAssetId, input.assetId),
      eq(derivedAssets.type, "logo_removed"),
    ),
    orderBy: [desc(derivedAssets.createdAt)],
  });
  if (existing) {
    await db
      .update(generatedAssets)
      .set({
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
    const inspection = await inspectImage(cleaned.buffer);
    const extension = inspection.format === "jpeg" ? "jpg" : inspection.format;
    const storageKey = `derived/${input.assetId}/logo-removed.${extension}`;
    await new LocalStorageProvider().put(
      storageKey,
      cleaned.buffer,
      cleaned.mimeType,
    );
    const [derived] = await db
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
        mimeType: cleaned.mimeType,
        fileSize: inspection.fileSize,
        checksum: inspection.checksum,
        perceptualHash: inspection.perceptualHash,
        mayReinterpretDetail: false,
      })
      .returning();
    await db
      .update(generatedAssets)
      .set({
        logoRemovalStatus: "completed",
        logoRemovalError: null,
        updatedAt: new Date(),
      })
      .where(eq(generatedAssets.id, input.assetId));
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
