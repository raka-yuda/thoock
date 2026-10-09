import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { commercialBriefs, generatedAssets, generationJobs } from "@/db/schema";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import { dateOnlySchema, resolveDateRange } from "@/lib/domain/date-range";
import { enforceMonthlyBudget } from "@/lib/domain/cost";
import { classifyGenerationFailure } from "@/lib/domain/generation-failure";
import { decideUpscale } from "@/lib/domain/image";
import {
  estimateGenerationCost,
  getExpectedDimensions,
  snapshotModelCapability,
} from "@/lib/domain/model-catalog";
import { createGenerationProvider } from "@/modules/providers/generation";
import { removeSnapgenLogo } from "@/modules/assets/remove-snapgen-logo";
import { SharpInspectionProvider } from "@/modules/providers/inspection";
import { loadConfiguredModelCatalog } from "@/modules/providers/model-catalog.server";
import { observeProviderGeneration } from "@/modules/providers/request-observability";
import { isSnapgenNanoModel } from "@/modules/providers/snapgen-logo-removal";
import { LocalStorageProvider } from "@/modules/providers/storage";
import { warmReviewThumbnail } from "@/modules/assets/image-variant-cache";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    briefId: z.string().uuid().optional(),
    capabilityId: z.string().min(1).max(160),
    strategy: z.enum(["economical", "direct_4mp", "custom"]),
    prompt: z.string().min(10).max(10_000),
    negativePrompt: z.string().max(10_000).optional(),
    resolution: z.string().min(1).max(80),
    quality: z.string().max(80).optional(),
    aspectRatio: z.string().min(1).max(20),
    candidates: z.number().int().min(1).max(6),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
    idempotencyKey: z.string().min(8).max(100),
    retryOfJobId: z.string().uuid().optional(),
    regenerateOfAssetId: z.string().uuid().optional(),
  })
  .refine((value) => !(value.retryOfJobId && value.regenerateOfAssetId), {
    message: "A generation request cannot be both a retry and a regeneration.",
  });

const historyQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  status: z
    .enum(["queued", "running", "succeeded", "failed", "cancelled"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional(),
  briefId: z.string().uuid().optional(),
  provider: z.string().trim().min(1).max(60).optional(),
  result: z.enum(["has_image", "no_image"]).optional(),
  retryable: z.coerce.boolean().optional(),
  paid: z.coerce.boolean().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  sort: z
    .enum(["newest", "oldest", "name_asc", "name_desc", "updated_desc"])
    .default("newest"),
});

const completedRequests = new Map<string, unknown>();

async function get(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = historyQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "Invalid generation-history filters",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  if (!process.env.DATABASE_URL)
    return NextResponse.json({
      data: [],
      pagination: { page: parsed.data.page, pageSize: parsed.data.pageSize ?? parsed.data.limit ?? 10, total: 0, totalPages: 0 },
      summary: { total: 0, succeeded: 0, failed: 0, running: 0 },
      mode: "demo",
    });
  let dateRange: ReturnType<typeof resolveDateRange>;
  try {
    dateRange = resolveDateRange(
      parsed.data.from,
      parsed.data.to,
      Number(process.env.APP_TIME_ZONE_OFFSET_MINUTES ?? 420),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid date range." },
      { status: 400 },
    );
  }
  const db = getDb();
  const pageSize = parsed.data.pageSize ?? parsed.data.limit ?? 10;
  const conditions: SQL[] = [
    parsed.data.status
      ? eq(generationJobs.status, parsed.data.status)
      : undefined,
    parsed.data.briefId
      ? eq(generationJobs.briefId, parsed.data.briefId)
      : undefined,
    parsed.data.provider
      ? eq(generationJobs.provider, parsed.data.provider)
      : undefined,
    parsed.data.q
      ? or(
          ilike(commercialBriefs.name, `%${parsed.data.q}%`),
          ilike(generationJobs.model, `%${parsed.data.q}%`),
          ilike(generationJobs.prompt, `%${parsed.data.q}%`),
        )
      : undefined,
    parsed.data.result === "has_image"
      ? sql`exists (select 1 from generated_assets asset where asset.generation_job_id = ${generationJobs.id})`
      : parsed.data.result === "no_image"
        ? sql`not exists (select 1 from generated_assets asset where asset.generation_job_id = ${generationJobs.id})`
        : undefined,
    parsed.data.retryable ? eq(generationJobs.status, "failed") : undefined,
    parsed.data.paid
      ? sql`${generationJobs.provider} not in ('mock', 'imported')`
      : undefined,
    dateRange.start ? gte(generationJobs.createdAt, dateRange.start) : undefined,
    dateRange.endExclusive
      ? lt(generationJobs.createdAt, dateRange.endExclusive)
      : undefined,
  ].filter((condition): condition is SQL => condition !== undefined);
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db
    .select({ total: count() })
    .from(generationJobs)
    .innerJoin(commercialBriefs, eq(generationJobs.briefId, commercialBriefs.id))
    .where(where);
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(parsed.data.page, Math.max(totalPages, 1));
  const orderBy =
    parsed.data.sort === "oldest"
      ? asc(generationJobs.createdAt)
      : parsed.data.sort === "name_asc"
        ? asc(commercialBriefs.name)
        : parsed.data.sort === "name_desc"
          ? desc(commercialBriefs.name)
          : parsed.data.sort === "updated_desc"
            ? desc(generationJobs.updatedAt)
            : desc(generationJobs.createdAt);
  const rows = await db
    .select({
      id: generationJobs.id,
      retryOfJobId: generationJobs.retryOfJobId,
      regenerateOfJobId: generationJobs.regenerateOfJobId,
      briefId: generationJobs.briefId,
      briefName: commercialBriefs.name,
      prompt: generationJobs.prompt,
      negativePrompt: generationJobs.negativePrompt,
      provider: generationJobs.provider,
      model: generationJobs.model,
      strategy: generationJobs.strategy,
      resolution: generationJobs.resolution,
      quality: generationJobs.quality,
      aspectRatio: generationJobs.aspectRatio,
      seed: generationJobs.seed,
      modelCapabilitySnapshot: generationJobs.modelCapabilitySnapshot,
      candidateCount: generationJobs.candidateCount,
      estimatedCostUsd: generationJobs.estimatedCostUsd,
      actualCostUsd: generationJobs.actualCostUsd,
      providerRequestId: generationJobs.providerRequestId,
      providerRequestIds: generationJobs.providerRequestIds,
      status: generationJobs.status,
      progress: generationJobs.progress,
      errorDetails: generationJobs.errorDetails,
      failureKind: generationJobs.failureKind,
      attemptCount: generationJobs.attemptCount,
      createdAt: generationJobs.createdAt,
      updatedAt: generationJobs.updatedAt,
      completedAt: generationJobs.completedAt,
    })
    .from(generationJobs)
    .innerJoin(
      commercialBriefs,
      eq(generationJobs.briefId, commercialBriefs.id),
    )
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const resultAssets = rows.length
    ? await db
        .select({
          id: generatedAssets.id,
          generationJobId: generatedAssets.generationJobId,
          storageKey: generatedAssets.storageKey,
          originalFilename: generatedAssets.originalFilename,
          width: generatedAssets.width,
          height: generatedAssets.height,
          megapixels: generatedAssets.megapixels,
        })
        .from(generatedAssets)
        .where(
          inArray(
            generatedAssets.generationJobId,
            rows.map((row) => row.id),
          ),
        )
    : [];
  const staleAfterMs = 15 * 60 * 1_000;
  return NextResponse.json({
    data: rows.map((row) => ({
      ...row,
      assets: resultAssets
        .filter((asset) => asset.generationJobId === row.id)
        .sort((left, right) =>
          left.originalFilename.localeCompare(right.originalFilename),
        )
        .map((asset) => ({
          id: asset.id,
          sourceUrl: `/api/assets/${asset.storageKey
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
          originalFilename: asset.originalFilename,
          width: asset.width,
          height: asset.height,
          megapixels: asset.megapixels,
        })),
      stale:
        row.status === "running" &&
        Date.now() - row.updatedAt.getTime() >= staleAfterMs,
    })),
    pagination: { page, pageSize, total, totalPages },
    summary: {
      total,
      succeeded: Number(rows.filter((row) => row.status === "succeeded").length),
      failed: Number(rows.filter((row) => row.status === "failed").length),
      running: Number(rows.filter((row) => row.status === "running" || row.status === "queued").length),
    },
    mode: "database",
  });
}

async function post(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid generation request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const existing = completedRequests.get(parsed.data.idempotencyKey);
  if (existing) return NextResponse.json(existing, { status: 200 });

  const capability = (await loadConfiguredModelCatalog()).find(
    (item) => item.id === parsed.data.capabilityId,
  );
  if (!capability || !capability.enabled)
    return NextResponse.json(
      { error: "The selected model capability is missing or disabled." },
      { status: 409 },
    );
  if (!capability.supportedAspectRatios.includes(parsed.data.aspectRatio))
    return NextResponse.json(
      { error: "The model does not support that aspect ratio." },
      { status: 400 },
    );
  if (parsed.data.negativePrompt && !capability.supportsNegativePrompt)
    return NextResponse.json(
      { error: "The model does not support negative prompts." },
      { status: 400 },
    );
  if (parsed.data.seed !== undefined && !capability.supportsSeed)
    return NextResponse.json(
      { error: "The model does not support seeds." },
      { status: 400 },
    );
  const dimensions = getExpectedDimensions(
    capability,
    parsed.data.resolution,
    parsed.data.aspectRatio,
  );
  if (!dimensions)
    return NextResponse.json(
      {
        error:
          "Expected dimensions are not configured for this model, resolution, and aspect ratio.",
      },
      { status: 409 },
    );

  const estimate = estimateGenerationCost(capability, parsed.data.candidates);
  const provider = createGenerationProvider(capability.providerId);
  if (!provider.isConfigured())
    return NextResponse.json(
      { error: `${provider.label} is not configured on the server.` },
      { status: 409 },
    );
  const budget = enforceMonthlyBudget({
    spentUsd: 0,
    estimateUsd: estimate ?? 0,
    monthlyLimitIdr: Number(process.env.DEFAULT_MONTHLY_BUDGET_IDR ?? 500_000),
    usdToIdr: Number(process.env.DEFAULT_USD_TO_IDR ?? 17_650),
  });
  if (!budget.allowed)
    return NextResponse.json(
      { error: "Monthly generation and upscaling budget reached." },
      { status: 402 },
    );

  let persistedJobId: string | null = null;
  let attemptCount = 1;
  let regenerateOfJobId: string | null = null;
  if (process.env.DATABASE_URL) {
    if (!parsed.data.briefId)
      return NextResponse.json(
        { error: "Select a saved commercial brief before generation." },
        { status: 400 },
      );
    const db = getDb();
    const duplicate = await db.query.generationJobs.findFirst({
      where: eq(generationJobs.idempotencyKey, parsed.data.idempotencyKey),
    });
    if (duplicate)
      return NextResponse.json(
        {
          error:
            "This generation request was already recorded. Start a new confirmed request instead of charging it twice.",
          jobId: duplicate.id,
          status: duplicate.status,
        },
        { status: 409 },
      );
    const brief = await db.query.commercialBriefs.findFirst({
      where: eq(commercialBriefs.id, parsed.data.briefId),
    });
    if (!brief)
      return NextResponse.json(
        { error: "The selected commercial brief no longer exists." },
        { status: 404 },
      );
    if (parsed.data.retryOfJobId) {
      const retrySource = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, parsed.data.retryOfJobId),
      });
      if (!retrySource || retrySource.briefId !== brief.id)
        return NextResponse.json(
          {
            error:
              "The failed generation attempt could not be found for this brief.",
          },
          { status: 404 },
        );
      if (retrySource.status !== "failed")
        return NextResponse.json(
          { error: "Only failed generation attempts can be retried." },
          { status: 409 },
        );
      attemptCount = retrySource.attemptCount + 1;
    }
    if (parsed.data.regenerateOfAssetId) {
      const regenerateSourceAsset = await db.query.generatedAssets.findFirst({
        where: eq(generatedAssets.id, parsed.data.regenerateOfAssetId),
      });
      if (!regenerateSourceAsset)
        return NextResponse.json(
          { error: "The source image for regeneration could not be found." },
          { status: 404 },
        );
      const regenerateSourceJob = await db.query.generationJobs.findFirst({
        where: eq(generationJobs.id, regenerateSourceAsset.generationJobId),
      });
      if (!regenerateSourceJob || regenerateSourceJob.briefId !== brief.id)
        return NextResponse.json(
          { error: "The source generation does not belong to this brief." },
          { status: 409 },
        );
      if (regenerateSourceJob.status !== "succeeded")
        return NextResponse.json(
          { error: "Only a completed generation can be regenerated." },
          { status: 409 },
        );
      regenerateOfJobId = regenerateSourceJob.id;
      attemptCount = regenerateSourceJob.attemptCount + 1;
    }
    const [job] = await db
      .insert(generationJobs)
      .values({
        retryOfJobId: parsed.data.retryOfJobId,
        regenerateOfJobId,
        briefId: brief.id,
        idempotencyKey: parsed.data.idempotencyKey,
        prompt: parsed.data.prompt,
        negativePrompt: parsed.data.negativePrompt ?? "",
        provider: capability.providerId,
        model: capability.providerModelId,
        strategy: parsed.data.strategy,
        resolution: parsed.data.resolution,
        quality: parsed.data.quality,
        aspectRatio: parsed.data.aspectRatio,
        seed: parsed.data.seed,
        modelCapabilitySnapshot: snapshotModelCapability(capability),
        requestedWidth: dimensions.width,
        requestedHeight: dimensions.height,
        candidateCount: parsed.data.candidates,
        estimatedCostUsd: String(estimate ?? 0),
        estimatedPipelineCostUsd: String(estimate ?? 0),
        status: "running",
        progress: 10,
        attemptCount,
      })
      .returning();
    persistedJobId = job.id;
    await db
      .update(commercialBriefs)
      .set({ status: "generating", updatedAt: new Date() })
      .where(eq(commercialBriefs.id, brief.id));
  }

  try {
    const providerRequest = {
      prompt: parsed.data.prompt,
      negativePrompt: parsed.data.negativePrompt,
      model: capability.providerModelId,
      requestedWidth: dimensions.width,
      requestedHeight: dimensions.height,
      aspectRatio: parsed.data.aspectRatio,
      resolution: parsed.data.resolution,
      quality: parsed.data.quality,
      candidates: parsed.data.candidates,
      seed: parsed.data.seed,
    };
    const generated = await observeProviderGeneration(
      {
        generationJobId: persistedJobId,
        sourcePath: "/api/generation",
        idempotencyKey: parsed.data.idempotencyKey,
        provider: capability.providerId,
        model: capability.providerModelId,
        estimatedCostUsd: estimate,
        requestBody: parsed.data,
        providerRequest:
          provider.normalizeRequestForProvider?.(providerRequest) ??
          providerRequest,
        onProviderRequestAccepted: persistedJobId
          ? async (providerRequestId, candidateIndex) => {
              const job = await getDb().query.generationJobs.findFirst({
                where: eq(generationJobs.id, persistedJobId!),
                columns: { providerRequestIds: true },
              });
              const ids = [...(job?.providerRequestIds ?? [])];
              ids[candidateIndex] = providerRequestId;
              await getDb()
                .update(generationJobs)
                .set({
                  providerRequestId: ids[0] ?? providerRequestId,
                  providerRequestIds: ids.filter(Boolean),
                  progress: Math.max(
                    15,
                    Math.round(
                      ((candidateIndex + 1) / parsed.data.candidates) * 40,
                    ),
                  ),
                  updatedAt: new Date(),
                })
                .where(eq(generationJobs.id, persistedJobId!));
            }
          : undefined,
      },
      (onProviderRequestAccepted) =>
        provider.generate(providerRequest, { onProviderRequestAccepted }),
    );
    const inspector = new SharpInspectionProvider();
    const storage = new LocalStorageProvider();
    const jobId = persistedJobId ?? randomUUID();
    const removeNanoLogo =
      capability.providerId === "snapgen" &&
      isSnapgenNanoModel(capability.providerModelId);
    const assets = await Promise.all(
      generated.map(async (image, index) => {
        // This local inspection is authoritative even when provider-reported dimensions disagree.
        const inspection = await inspector.inspect(image.buffer);
        const extension =
          inspection.format === "jpeg" ? "jpg" : inspection.format;
        const storageKey = `generated/${jobId}/candidate-${index + 1}.${extension}`;
        await storage.put(storageKey, image.buffer, image.mimeType);
        if (!removeNanoLogo)
          await warmReviewThumbnail({
            storage,
            storageKey,
            source: image.buffer,
          });
        return {
          id: String(randomUUID()),
          storageKey,
          requestedDimensions: dimensions,
          providerReportedDimensions: {
            width: image.providerReportedWidth,
            height: image.providerReportedHeight,
          },
          actualInspectedDimensions: {
            width: inspection.width,
            height: inspection.height,
          },
          actualMegapixels: inspection.megapixels,
          format: inspection.format,
          fileSize: inspection.fileSize,
          checksum: inspection.checksum,
          perceptualHash: inspection.perceptualHash,
          hasMetadata: inspection.hasMetadata,
          upscale: decideUpscale(inspection.width, inspection.height),
          providerRequestId: image.providerRequestId,
          logoRemoval: {
            status: removeNanoLogo ? "pending" : "not_required",
            method: removeNanoLogo ? "fast" : null,
            error: null as string | null,
          },
        };
      }),
    );
    if (persistedJobId) {
      const db = getDb();
      const actualCostUsd = generated.every(
        (image) => image.actualCostUsd !== undefined,
      )
        ? generated.reduce(
            (total, image) => total + (image.actualCostUsd ?? 0),
            0,
          )
        : null;
      const inserted = await db
        .insert(generatedAssets)
        .values(
          assets.map((asset, index) => ({
            id: asset.id,
            generationJobId: persistedJobId!,
            storageKey: asset.storageKey,
            originalFilename: `candidate-${index + 1}.${asset.format === "jpeg" ? "jpg" : asset.format}`,
            providerRequestId: asset.providerRequestId,
            mimeType: generated[index].mimeType,
            providerReportedWidth:
              asset.providerReportedDimensions.width ?? undefined,
            providerReportedHeight:
              asset.providerReportedDimensions.height ?? undefined,
            width: asset.actualInspectedDimensions.width,
            height: asset.actualInspectedDimensions.height,
            megapixels: String(asset.actualMegapixels),
            fileSize: asset.fileSize,
            checksum: asset.checksum,
            perceptualHash: asset.perceptualHash,
            hasMetadata: asset.hasMetadata,
            logoRemovalStatus: asset.logoRemoval.status,
            logoRemovalError: null,
            upscaleStatus: asset.upscale.required
              ? ("upscale_required" as const)
              : ("upscale_not_required" as const),
          })),
        )
        .returning();
      if (removeNanoLogo) {
        for (const asset of assets) {
          try {
            const cleaned = await removeSnapgenLogo({
              assetId: asset.id,
              generationJobId: persistedJobId,
              model: capability.providerModelId,
              historyUuid: asset.providerRequestId,
              idempotencyKey: `${persistedJobId}:logo:${asset.id}`,
              sourcePath: "/api/generation",
            });
            asset.storageKey = cleaned.storageKey;
            asset.actualInspectedDimensions = {
              width: cleaned.width,
              height: cleaned.height,
            };
            asset.actualMegapixels = Number(cleaned.megapixels);
            asset.format = "jpeg";
            asset.fileSize = cleaned.fileSize;
            asset.checksum = cleaned.checksum;
            asset.perceptualHash = cleaned.perceptualHash;
            asset.logoRemoval.status = "completed";
          } catch (logoRemovalError) {
            asset.logoRemoval.status = "failed";
            asset.logoRemoval.error =
              logoRemovalError instanceof Error
                ? logoRemovalError.message
                : "SnapGenAI logo removal failed.";
          }
        }
      }
      await db
        .update(generationJobs)
        .set({
          status: "succeeded",
          progress: 100,
          actualCostUsd: actualCostUsd === null ? null : String(actualCostUsd),
          providerRequestId: generated[0]?.providerRequestId,
          providerRequestIds: generated.map((image) => image.providerRequestId),
          errorDetails: null,
          failureKind: null,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(generationJobs.id, persistedJobId));
      await db
        .update(commercialBriefs)
        .set({ status: "complete", updatedAt: new Date() })
        .where(eq(commercialBriefs.id, parsed.data.briefId!));
      for (let index = 0; index < assets.length; index += 1)
        assets[index].id = inserted[index].id;
    }
    const payload = {
      data: {
        id: jobId,
        status: "succeeded",
        strategy: parsed.data.strategy,
        estimatedCostUsd: estimate,
        capabilitySnapshot: snapshotModelCapability(capability),
        assets,
      },
    };
    completedRequests.set(parsed.data.idempotencyKey, payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const failureKind = classifyGenerationFailure(error);
    const errorDetails =
      error instanceof Error ? error.message : "Generation failed.";
    if (persistedJobId) {
      const db = getDb();
      await db
        .update(generationJobs)
        .set({
          status: "failed",
          progress: 0,
          errorDetails,
          failureKind,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(generationJobs.id, persistedJobId));
      await db
        .update(commercialBriefs)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(commercialBriefs.id, parsed.data.briefId!));
    }
    return NextResponse.json(
      {
        error: errorDetails,
        jobId: persistedJobId,
        status: persistedJobId ? "failed" : undefined,
        failureKind,
        retryable: failureKind === "retryable",
      },
      { status: 502 },
    );
  }
}

export const GET = withApiLogging(get);
export const POST = withApiLogging(post);
