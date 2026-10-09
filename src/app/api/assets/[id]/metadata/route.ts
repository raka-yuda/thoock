import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  assetMetadata,
  commercialBriefs,
  generatedAssets,
  generationJobs,
} from "@/db/schema";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import {
  assetMetadataSchema,
  validateAdobeMetadata,
} from "@/lib/domain/metadata";
import {
  BriefMetadataProvider,
  DeterministicMetadataProvider,
  GeminiMetadataProvider,
  OpenAIMetadataProvider,
} from "@/modules/providers/metadata";
import { observeProviderOperation } from "@/modules/providers/request-observability";

const generateSchema = z.object({
  provider: z
    .enum([
      "brief-metadata",
      "mock-metadata",
      "gemini-metadata",
      "openai-metadata",
    ])
    .default("brief-metadata"),
});

async function loadAsset(id: string) {
  const [record] = await getDb()
    .select({
      assetId: generatedAssets.id,
      briefName: commercialBriefs.name,
      prompt: generationJobs.prompt,
      metadataTitle: commercialBriefs.metadataTitle,
      metadataCategory: commercialBriefs.metadataCategory,
      metadataLanguage: commercialBriefs.metadataLanguage,
      metadataKeywords: commercialBriefs.metadataKeywords,
      metadataFictionalPeopleProperty:
        commercialBriefs.metadataFictionalPeopleProperty,
      metadataNotes: commercialBriefs.metadataNotes,
    })
    .from(generatedAssets)
    .innerJoin(generationJobs, eq(generatedAssets.generationJobId, generationJobs.id))
    .innerJoin(commercialBriefs, eq(generationJobs.briefId, commercialBriefs.id))
    .where(eq(generatedAssets.id, id))
    .limit(1);
  return record;
}

async function post(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json({ error: "Database is not configured." }, { status: 409 });
  const parsed = generateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid metadata request." }, { status: 400 });
  const { id } = await context.params;
  const asset = await loadAsset(id);
  if (!asset)
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  const provider =
    parsed.data.provider === "openai-metadata"
      ? new OpenAIMetadataProvider()
      : parsed.data.provider === "gemini-metadata"
      ? new GeminiMetadataProvider()
      : parsed.data.provider === "mock-metadata"
        ? new DeterministicMetadataProvider()
        : new BriefMetadataProvider();
  try {
    if (!provider.isConfigured())
      return NextResponse.json(
        { error: `${provider.label} is not configured on the server.` },
        { status: 409 },
      );
    const providerInput = {
      briefName: asset.briefName,
      prompt: asset.prompt,
      filenameHint: `${asset.assetId.slice(0, 6)}-${asset.briefName}`,
      briefPlan: {
        title: asset.metadataTitle,
        category: asset.metadataCategory,
        language: asset.metadataLanguage,
        keywords: asset.metadataKeywords,
        fictionalPeopleProperty: asset.metadataFictionalPeopleProperty,
        notes: asset.metadataNotes,
      },
    };
    const metadata = await observeProviderOperation(
      {
        generationJobId: null,
        sourcePath: request.nextUrl.pathname,
        idempotencyKey: `metadata-generation:${crypto.randomUUID()}`,
        provider: provider.id,
        model: provider.model,
        operation: "metadata_generation",
        estimatedCostUsd: null,
        requestBody: { provider: parsed.data.provider, assetId: asset.assetId },
        providerRequest: providerInput,
        summarizeResult: (generated) => ({
          filename: generated.filename,
          title: generated.title,
          category: generated.category,
          keywordCount: generated.keywords.length,
        }),
      },
      () => provider.generate(providerInput),
    );
    const validation = validateAdobeMetadata(metadata);
    const [saved] = await getDb()
      .insert(assetMetadata)
      .values({
        generatedAssetId: asset.assetId,
        ...metadata,
        internalNotes: metadata.internalNotes ?? "",
        validationErrors: [...validation.errors, ...validation.prohibited],
      })
      .onConflictDoUpdate({
        target: assetMetadata.generatedAssetId,
        set: {
          filename: metadata.filename,
          title: metadata.title,
          category: metadata.category,
          language: metadata.language,
          keywords: metadata.keywords,
          generativeAi: metadata.generativeAi,
          fictionalPeopleProperty: metadata.fictionalPeopleProperty,
          internalNotes: metadata.internalNotes ?? "",
          validationErrors: [...validation.errors, ...validation.prohibited],
          updatedAt: new Date(),
        },
      })
      .returning();
    return NextResponse.json({ data: saved, validation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Metadata generation failed." },
      { status: parsed.data.provider === "brief-metadata" ? 409 : 502 },
    );
  }
}

async function patch(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = assetMetadataSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Metadata is not Adobe-ready.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const { id } = await context.params;
  const validation = validateAdobeMetadata(parsed.data);
  if (!validation.valid)
    return NextResponse.json(
      { error: "Metadata contains prohibited terms.", validation },
      { status: 409 },
    );
  const [updated] = await getDb()
    .update(assetMetadata)
    .set({
      ...parsed.data,
      internalNotes: parsed.data.internalNotes ?? "",
      validationErrors: [],
      updatedAt: new Date(),
    })
    .where(eq(assetMetadata.generatedAssetId, id))
    .returning();
  if (!updated)
    return NextResponse.json({ error: "Generate metadata first." }, { status: 404 });
  return NextResponse.json({ data: updated });
}

export const POST = withApiLogging(post);
export const PATCH = withApiLogging(patch);
