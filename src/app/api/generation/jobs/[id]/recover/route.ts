import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  commercialBriefs,
  generatedAssets,
  generationJobs,
} from "@/db/schema";
import { readSession } from "@/lib/auth";
import { classifyGenerationFailure } from "@/lib/domain/generation-failure";
import { decideUpscale } from "@/lib/domain/image";
import { removeSnapgenLogo } from "@/modules/assets/remove-snapgen-logo";
import { SnapGenImageGenerationProvider } from "@/modules/providers/generation";
import { SharpInspectionProvider } from "@/modules/providers/inspection";
import {
  observeProviderHistoryLookup,
  observeProviderHistorySearch,
} from "@/modules/providers/request-observability";
import { createHistoryLookupLogKey } from "@/modules/providers/request-log-key";
import { isSnapgenNanoModel } from "@/modules/providers/snapgen-logo-removal";
import { LocalStorageProvider } from "@/modules/providers/storage";

export const runtime = "nodejs";

const requestSchema = z.object({
  providerRequestId: z.string().trim().min(8).max(200).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: "Database is not configured." },
      { status: 409 },
    );
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Enter a valid SnapGen history UUID." },
      { status: 400 },
    );

  const { id } = await context.params;
  const db = getDb();
  const job = await db.query.generationJobs.findFirst({
    where: eq(generationJobs.id, id),
  });
  if (!job)
    return NextResponse.json(
      { error: "Generation job not found." },
      { status: 404 },
    );
  if (job.provider !== "snapgen")
    return NextResponse.json(
      { error: "Manual provider-result checks currently support SnapGenAI only." },
      { status: 409 },
    );
  if (!new Set(["failed", "running"]).has(job.status))
    return NextResponse.json(
      { error: "Only failed or processing jobs need a provider-result check." },
      { status: 409 },
    );

  const provider = new SnapGenImageGenerationProvider();
  let requestIds = [
    ...new Set(
      parsed.data.providerRequestId
        ? [parsed.data.providerRequestId]
        : job.providerRequestIds.length
          ? job.providerRequestIds
          : job.providerRequestId
            ? [job.providerRequestId]
            : [],
    ),
  ];
  if (!requestIds.length) {
    try {
      const matches = await observeProviderHistorySearch(
        {
          generationJobId: job.id,
          sourcePath: `/api/generation/jobs/${job.id}/recover`,
          idempotencyKey: createHistoryLookupLogKey(
            job.id,
            "search",
            randomUUID(),
          ),
          model: job.model,
          providerRequestId: "history-list",
          prompt: job.prompt,
          createdAt: job.createdAt,
          providerRequest: provider.normalizeHistorySearchRequest(),
        },
        () =>
          provider.findHistoryMatches({
            prompt: job.prompt,
            model: job.model,
            createdAt: job.createdAt,
          }),
      );
      if (!matches.length)
        return NextResponse.json({
          data: {
            status: "not_found",
            providerRequestIds: [],
            importedAssetIds: [],
            message:
              "No matching SnapGenAI history record was found for this prompt, model, and request time. SnapGen may not have created the job; retrying will submit a new paid request.",
          },
        });
      if (matches.length > 1)
        return NextResponse.json(
          {
            error: `Multiple matching SnapGenAI records were found. Paste the correct UUID from this list: ${matches.map((match) => match.providerRequestId).join(", ")}`,
          },
          { status: 409 },
        );
      requestIds = [matches[0].providerRequestId];
    } catch (error) {
      const failureKind = classifyGenerationFailure(error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `${error.message} No new generation was submitted.`
              : "Provider history search failed. No new generation was submitted.",
          retryable: failureKind === "retryable",
        },
        { status: 502 },
      );
    }
  }

  const mergedRequestIds = [
    ...new Set([...job.providerRequestIds, ...(job.providerRequestId ? [job.providerRequestId] : []), ...requestIds]),
  ];
  await db
    .update(generationJobs)
    .set({
      providerRequestId: mergedRequestIds[0],
      providerRequestIds: mergedRequestIds,
      updatedAt: new Date(),
    })
    .where(eq(generationJobs.id, job.id));

  const inspector = new SharpInspectionProvider();
  const storage = new LocalStorageProvider();
  const importedAssetIds: string[] = [];
  let processingCount = 0;
  const providerFailures: string[] = [];

  try {
    for (let index = 0; index < requestIds.length; index += 1) {
      const providerRequestId = requestIds[index];
      const existing = await db.query.generatedAssets.findFirst({
        where: and(
          eq(generatedAssets.generationJobId, job.id),
          eq(generatedAssets.providerRequestId, providerRequestId),
        ),
      });
      if (existing) {
        importedAssetIds.push(existing.id);
        continue;
      }

      const result = await observeProviderHistoryLookup(
        {
          generationJobId: job.id,
          sourcePath: `/api/generation/jobs/${job.id}/recover`,
          idempotencyKey: createHistoryLookupLogKey(
            job.id,
            providerRequestId,
            randomUUID(),
          ),
          model: job.model,
          providerRequestId,
          providerRequest: provider.normalizeHistoryRequest(providerRequestId),
        },
        () => provider.checkHistory(providerRequestId),
      );
      if (result.status === "processing") {
        processingCount += 1;
        continue;
      }
      if (result.status === "failed") {
        providerFailures.push(
          result.errorDetails ?? `SnapGenAI job ${providerRequestId} failed.`,
        );
        continue;
      }
      if (!result.image)
        throw new Error("SnapGenAI reported completion without an image result.");

      const inspection = await inspector.inspect(result.image.buffer);
      const extension = inspection.format === "jpeg" ? "jpg" : inspection.format;
      const assetId = randomUUID();
      const storageKey = `generated/${job.id}/recovered-${index + 1}-${assetId.slice(0, 8)}.${extension}`;
      await storage.put(storageKey, result.image.buffer, result.image.mimeType);
      const removeNanoLogo = isSnapgenNanoModel(job.model);
      const [asset] = await db
        .insert(generatedAssets)
        .values({
          id: assetId,
          generationJobId: job.id,
          storageKey,
          originalFilename: `recovered-${index + 1}.${extension}`,
          providerRequestId: result.providerRequestId,
          mimeType: result.image.mimeType,
          providerReportedWidth:
            result.image.providerReportedWidth ?? undefined,
          providerReportedHeight:
            result.image.providerReportedHeight ?? undefined,
          width: inspection.width,
          height: inspection.height,
          megapixels: String(inspection.megapixels),
          fileSize: inspection.fileSize,
          checksum: inspection.checksum,
          perceptualHash: inspection.perceptualHash,
          hasMetadata: inspection.hasMetadata,
          logoRemovalStatus: removeNanoLogo ? "pending" : "not_required",
          upscaleStatus: decideUpscale(inspection.width, inspection.height).required
            ? "upscale_required"
            : "upscale_not_required",
        })
        .returning();
      importedAssetIds.push(asset.id);

      if (removeNanoLogo) {
        try {
          await removeSnapgenLogo({
            assetId: asset.id,
            generationJobId: job.id,
            model: job.model,
            historyUuid: result.providerRequestId,
            idempotencyKey: `${job.id}:logo:${asset.id}`,
            sourcePath: `/api/generation/jobs/${job.id}/recover`,
          });
        } catch {
          // The generated original remains available and the cleanup failure is
          // recorded on the asset for a separate manual retry.
        }
      }
    }
  } catch (error) {
    const failureKind = classifyGenerationFailure(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.message} No new generation was submitted.`
            : "Provider result check failed. No new generation was submitted.",
        retryable: failureKind === "retryable",
      },
      { status: 502 },
    );
  }

  const now = new Date();
  const status = providerFailures.length
    ? "failed"
    : processingCount
      ? "running"
      : "succeeded";
  const errorDetails = providerFailures.length
    ? providerFailures.join(" ").slice(0, 4_000)
    : processingCount
      ? "SnapGenAI is still processing this request. Use Check provider result again later."
      : null;
  await db
    .update(generationJobs)
    .set({
      status,
      progress: status === "succeeded" ? 100 : status === "running" ? 65 : 0,
      errorDetails,
      failureKind: status === "failed" ? "unknown" : null,
      completedAt: status === "running" ? null : now,
      updatedAt: now,
    })
    .where(eq(generationJobs.id, job.id));
  await db
    .update(commercialBriefs)
    .set({
      status: status === "succeeded" ? "complete" : status === "running" ? "generating" : "ready",
      updatedAt: now,
    })
    .where(eq(commercialBriefs.id, job.briefId));

  return NextResponse.json(
    {
      data: {
        status,
        providerRequestIds: requestIds,
        importedAssetIds,
        message:
          status === "succeeded"
            ? "The completed provider result was imported without starting a new generation."
            : errorDetails,
      },
    },
    { status: status === "running" ? 202 : 200 },
  );
}
