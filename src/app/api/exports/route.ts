import { desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  exportBatchItems,
  exportBatches,
  generatedAssets,
} from "@/db/schema";
import { readSession } from "@/lib/auth";
import { createExportArchive, type ExportItem } from "@/modules/exports/create-batch";
import { prepareApprovedAssetForExport } from "@/modules/exports/prepare-approved-asset";
import { LocalStorageProvider } from "@/modules/providers/storage";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(2).max(140),
  assetIds: z.array(z.string().uuid()).min(1).max(250),
});

export async function GET() {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json({ data: { batches: [], assets: {} }, mode: "demo" });

  const db = getDb();
  const [batches, items] = await Promise.all([
    db
      .select({
        id: exportBatches.id,
        name: exportBatches.name,
        status: exportBatches.status,
        itemCount: exportBatches.itemCount,
        csvBytes: exportBatches.csvBytes,
        createdAt: exportBatches.createdAt,
        updatedAt: exportBatches.updatedAt,
      })
      .from(exportBatches)
      .orderBy(desc(exportBatches.createdAt))
      .limit(100),
    db
      .select({
        generatedAssetId: exportBatchItems.generatedAssetId,
        exportBatchId: exportBatchItems.exportBatchId,
        batchName: exportBatches.name,
        exportedAt: exportBatches.updatedAt,
      })
      .from(exportBatchItems)
      .innerJoin(exportBatches, eq(exportBatchItems.exportBatchId, exportBatches.id))
      .where(eq(exportBatches.status, "succeeded"))
      .orderBy(desc(exportBatches.updatedAt)),
  ]);
  const assets: Record<string, { count: number; latestAt: Date; latestBatchName: string; batchIds: string[] }> = {};
  for (const item of items) {
    const current = assets[item.generatedAssetId];
    if (current) {
      current.count += 1;
      current.batchIds.push(item.exportBatchId);
    } else {
      assets[item.generatedAssetId] = {
        count: 1,
        latestAt: item.exportedAt,
        latestBatchName: item.batchName,
        batchIds: [item.exportBatchId],
      };
    }
  }
  return NextResponse.json({ data: { batches, assets }, mode: "database" });
}

export async function POST(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json({ error: "Database is not configured." }, { status: 409 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid export selection", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const db = getDb();
  const selectedAssets = await db
    .select()
    .from(generatedAssets)
    .where(inArray(generatedAssets.id, parsed.data.assetIds));
  if (selectedAssets.length !== new Set(parsed.data.assetIds).size)
    return NextResponse.json(
      { error: "One or more selected assets no longer exist." },
      { status: 404 },
    );
  const storage = new LocalStorageProvider();
  const [batch] = await db
    .insert(exportBatches)
    .values({ name: parsed.data.name, status: "running", itemCount: selectedAssets.length })
    .returning();
  try {
    const items: ExportItem[] = [];
    const databaseItems: Array<{
      generatedAssetId: string;
      preparedAssetId: string;
      filename: string;
    }> = [];
    for (const asset of selectedAssets) {
      const item = await prepareApprovedAssetForExport(asset.id);
      items.push(item);
      databaseItems.push({
        generatedAssetId: asset.id,
        preparedAssetId: item.preparedAssetId,
        filename: item.metadata.filename,
      });
    }
    const archive = await createExportArchive(parsed.data.name, items, 4);
    const archiveKey = `exports/${batch.id}/adobe-upload-pack.zip`;
    await storage.put(archiveKey, archive.buffer, "application/zip");
    await db.transaction(async (tx) => {
      await tx.insert(exportBatchItems).values(
        databaseItems.map((item) => ({ exportBatchId: batch.id, ...item })),
      );
      await tx
        .update(exportBatches)
        .set({
          status: "succeeded",
          storageKey: archiveKey,
          csvBytes: Buffer.byteLength(archive.csv, "utf8"),
          manifest: archive.manifest,
          complianceReport: archive.compliance,
          updatedAt: new Date(),
        })
        .where(eq(exportBatches.id, batch.id));
    });
    const safeName = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "adobe-stock";
    return new NextResponse(new Uint8Array(archive.buffer), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename=${safeName}.zip`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    await db
      .update(exportBatches)
      .set({
        status: "failed",
        errorDetails: error instanceof Error ? error.message : "Export failed.",
        updatedAt: new Date(),
      })
      .where(eq(exportBatches.id, batch.id));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed." },
      { status: 409 },
    );
  }
}
