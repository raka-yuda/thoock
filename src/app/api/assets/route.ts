import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  assetMetadata,
  assetReviews,
  commercialBriefs,
  derivedAssets,
  generatedAssets,
  generationJobs,
} from "@/db/schema";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import { normalizeAdobeCategory } from "@/lib/domain/adobe-categories";
import { normalizeKeywords } from "@/lib/domain/metadata";
import { selectCanonicalImage } from "@/modules/assets/canonical-image";

export const runtime = "nodejs";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(48).default(12),
  cursor: z.string().trim().max(400).optional(),
  id: z.string().uuid().optional(),
  briefId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  decision: z
    .enum(["pending", "approved", "rejected", "regenerate"])
    .optional(),
  provider: z.string().trim().max(60).optional(),
  technical: z.enum(["meets_4mp", "below_4mp"]).optional(),
  upscale: z.enum(["not_required", "required", "upscaled"]).optional(),
  metadata: z.enum(["complete", "incomplete"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const cursorSchema = z.object({
  createdAt: z.coerce.date(),
  id: z.string().uuid(),
});

function encodeCursor(asset: { createdAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify({ createdAt: asset.createdAt.toISOString(), id: asset.id }),
  ).toString("base64url");
}

function decodeCursor(value: string) {
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    throw new Error("Invalid asset cursor.");
  }
}

function assetUrls(storageKey: string) {
  const sourceUrl = `/api/assets/${storageKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  return {
    sourceUrl,
    thumbnailUrl: `${sourceUrl}?width=640`,
    previewUrl: `${sourceUrl}?width=1600`,
  };
}

async function get(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid asset feed request", issues: parsed.error.flatten() },
      { status: 400 },
    );

  const {
    limit,
    id,
    briefId,
    q,
    decision,
    provider,
    technical,
    upscale,
    metadata,
    from,
    to,
  } = parsed.data;
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (parsed.data.cursor) {
    try {
      cursor = decodeCursor(parsed.data.cursor);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid cursor." },
        { status: 400 },
      );
    }
  }

  const emptyPagination = { limit, hasMore: false, nextCursor: null };
  if (!process.env.DATABASE_URL)
    return NextResponse.json({
      data: [],
      pagination: emptyPagination,
      mode: "demo",
    });

  const conditions: SQL[] = [];
  if (id) conditions.push(eq(generatedAssets.id, id));
  if (briefId) conditions.push(eq(commercialBriefs.id, briefId));
  if (q)
    conditions.push(
      or(
        ilike(commercialBriefs.name, `%${q}%`),
        ilike(generatedAssets.originalFilename, `%${q}%`),
        ilike(generationJobs.prompt, `%${q}%`),
      )!,
    );
  if (decision)
    conditions.push(sql`
      COALESCE(
        (
          SELECT review.decision::text
          FROM asset_reviews AS review
          WHERE review.generated_asset_id = ${generatedAssets.id}
          ORDER BY review.created_at DESC
          LIMIT 1
        ),
        'pending'
      ) = ${decision}
    `);
  if (provider) conditions.push(eq(generationJobs.provider, provider));
  if (technical === "meets_4mp")
    conditions.push(gte(generatedAssets.megapixels, "4"));
  if (technical === "below_4mp")
    conditions.push(lt(generatedAssets.megapixels, "4"));
  if (upscale === "not_required")
    conditions.push(
      eq(generatedAssets.upscaleStatus, "upscale_not_required"),
    );
  if (upscale === "required")
    conditions.push(eq(generatedAssets.upscaleStatus, "upscale_required"));
  if (upscale === "upscaled")
    conditions.push(
      sql`${generatedAssets.upscaleStatus} in ('upscaled', 'awaiting_final_review', 'approved_after_upscale')`,
    );
  if (metadata === "complete")
    conditions.push(
      sql`exists (select 1 from asset_metadata m where m.generated_asset_id = ${generatedAssets.id})`,
    );
  if (metadata === "incomplete")
    conditions.push(
      sql`not exists (select 1 from asset_metadata m where m.generated_asset_id = ${generatedAssets.id})`,
    );
  if (from) conditions.push(gte(generatedAssets.createdAt, from));
  if (to) {
    const through = new Date(to);
    through.setUTCDate(through.getUTCDate() + 1);
    conditions.push(lt(generatedAssets.createdAt, through));
  }
  if (cursor && !id)
    conditions.push(
      or(
        lt(generatedAssets.createdAt, cursor.createdAt),
        and(
          eq(generatedAssets.createdAt, cursor.createdAt),
          lt(generatedAssets.id, cursor.id),
        ),
      )!,
    );

  const db = getDb();
  const rows = await db
    .select({
      id: generatedAssets.id,
      generationJobId: generatedAssets.generationJobId,
      activeDerivedAssetId: generatedAssets.activeDerivedAssetId,
      storageKey: generatedAssets.storageKey,
      originalFilename: generatedAssets.originalFilename,
      mimeType: generatedAssets.mimeType,
      width: generatedAssets.width,
      height: generatedAssets.height,
      megapixels: generatedAssets.megapixels,
      fileSize: generatedAssets.fileSize,
      checksum: generatedAssets.checksum,
      perceptualHash: generatedAssets.perceptualHash,
      hasMetadata: generatedAssets.hasMetadata,
      logoRemovalStatus: generatedAssets.logoRemovalStatus,
      logoRemovalError: generatedAssets.logoRemovalError,
      upscaleStatus: generatedAssets.upscaleStatus,
      createdAt: generatedAssets.createdAt,
      briefId: commercialBriefs.id,
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
      estimatedGenerationCostUsd: generationJobs.estimatedCostUsd,
      generationCostUsd: generationJobs.actualCostUsd,
    })
    .from(generatedAssets)
    .innerJoin(
      generationJobs,
      eq(generatedAssets.generationJobId, generationJobs.id),
    )
    .innerJoin(
      commercialBriefs,
      eq(generationJobs.briefId, commercialBriefs.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(generatedAssets.createdAt), desc(generatedAssets.id))
    .limit(id ? 1 : limit + 1);

  const hasMore = !id && rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const assetIds = page.map((asset) => asset.id);
  const activeDerivedAssetIds = page.flatMap((asset) =>
    asset.activeDerivedAssetId ? [asset.activeDerivedAssetId] : [],
  );
  const [reviews, metadataRows, canonicalDerivedRows] = assetIds.length
    ? await Promise.all([
        db
          .select()
          .from(assetReviews)
          .where(inArray(assetReviews.generatedAssetId, assetIds))
          .orderBy(desc(assetReviews.createdAt)),
        db
          .select()
          .from(assetMetadata)
          .where(inArray(assetMetadata.generatedAssetId, assetIds)),
        db
          .select()
          .from(derivedAssets)
          .where(
            and(
              inArray(derivedAssets.sourceAssetId, assetIds),
              activeDerivedAssetIds.length
                ? or(
                    eq(derivedAssets.type, "logo_removed"),
                    inArray(derivedAssets.id, activeDerivedAssetIds),
                  )
                : eq(derivedAssets.type, "logo_removed"),
            ),
          )
          .orderBy(desc(derivedAssets.createdAt)),
      ])
    : [[], [], []];

  const latestReviewByAsset = new Map<string, (typeof reviews)[number]>();
  for (const review of reviews) {
    if (
      review.generatedAssetId &&
      !latestReviewByAsset.has(review.generatedAssetId)
    )
      latestReviewByAsset.set(review.generatedAssetId, review);
  }
  const metadataByAsset = new Map(
    metadataRows.map((metadata) => [metadata.generatedAssetId, metadata]),
  );
  const activeDerivedById = new Map(
    canonicalDerivedRows.map((derived) => [derived.id, derived]),
  );
  const logoRemovedByAsset = new Map<
    string,
    (typeof canonicalDerivedRows)[number]
  >();
  for (const derived of canonicalDerivedRows)
    if (
      derived.type === "logo_removed" &&
      !logoRemovedByAsset.has(derived.sourceAssetId)
    )
      logoRemovedByAsset.set(derived.sourceAssetId, derived);

  const data = page.map((asset) => {
    const review = latestReviewByAsset.get(asset.id);
    const metadata = metadataByAsset.get(asset.id);
    const logoRemoved = logoRemovedByAsset.get(asset.id);
    const activeDerived = asset.activeDerivedAssetId
      ? activeDerivedById.get(asset.activeDerivedAssetId)
      : null;
    const effective = selectCanonicalImage(asset, activeDerived, logoRemoved);
    const effectiveDerived = effective.id === asset.id ? null : effective;
    return {
      ...asset,
      storageKey: effective.storageKey,
      mimeType: effective.mimeType,
      width: effective.width,
      height: effective.height,
      megapixels: effective.megapixels,
      fileSize: effective.fileSize,
      checksum: effective.checksum,
      perceptualHash: effective.perceptualHash,
      ...assetUrls(effective.storageKey),
      original: {
        ...assetUrls(asset.storageKey),
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        megapixels: asset.megapixels,
        fileSize: asset.fileSize,
        checksum: asset.checksum,
      },
      logoRemoval: {
        status:
          effectiveDerived?.type === "logo_removed" || logoRemoved
            ? "completed"
            : asset.logoRemovalStatus,
        method:
          effectiveDerived?.type === "logo_removed"
            ? effectiveDerived.method
            : (logoRemoved?.method ?? null),
        derivedAssetId:
          effectiveDerived?.type === "logo_removed"
            ? effectiveDerived.id
            : (logoRemoved?.id ?? null),
        error: asset.logoRemovalError,
      },
      canonical: {
        kind: effectiveDerived?.type ?? "original",
        derivedAssetId: effectiveDerived?.id ?? null,
      },
      review: review
        ? {
            id: review.id,
            decision: review.decision,
            notes: review.notes,
            reviewedAt: review.reviewedAt,
          }
        : { decision: "pending", notes: "", reviewedAt: null },
      metadata: metadata
        ? {
            ...metadata,
            category:
              normalizeAdobeCategory(metadata.category) ?? metadata.category,
            keywords: normalizeKeywords(metadata.keywords),
          }
        : null,
    };
  });

  return NextResponse.json({
    data,
    pagination: {
      limit,
      hasMore,
      nextCursor:
        hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
    },
    mode: "database",
  });
}

export const GET = withApiLogging(get);
