import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { commercialBriefs, generationJobs, opportunities } from "@/db/schema";
import { readSession } from "@/lib/auth";
import { appLogger, withApiLogging } from "@/lib/server/logger";
import { dateOnlySchema, resolveDateRange } from "@/lib/domain/date-range";
import { normalizeAdobeCategory } from "@/lib/domain/adobe-categories";
import { normalizeKeywords } from "@/lib/domain/metadata";
import { buildBriefUpdatedAtConditions } from "@/modules/briefs/list-filters";
import { createBriefGenerationProvider } from "@/modules/providers/brief-generation";
import { observeProviderOperation } from "@/modules/providers/request-observability";

export const runtime = "nodejs";

const createSchema = z.object({
  opportunityId: z.string().uuid(),
  provider: z.enum([
    "mock-brief-ai",
    "gemini-brief-ai",
    "openai-brief-ai",
  ]),
  count: z.coerce.number().int().min(1).max(12).default(3),
  preset: z.string().trim().max(120).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(10),
  q: z.string().trim().max(120).optional(),
  status: z
    .enum(["draft", "ready", "generating", "complete", "archived"])
    .optional(),
  orientation: z.enum(["horizontal", "square", "vertical"]).optional(),
  source: z.enum(["manual", "opportunity"]).optional(),
  opportunity: z.string().uuid().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  sort: z
    .enum([
      "newest",
      "oldest",
      "name_asc",
      "name_desc",
      "updated_asc",
      "updated_desc",
    ])
    .default("updated_desc"),
});

const splitList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const splitMetadataKeywords = (value: string) =>
  normalizeKeywords(value.split(/[|,]/));

async function get(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid brief filters", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const {
    page,
    pageSize,
    q,
    status,
    orientation,
    source,
    opportunity,
    sort,
    from,
    to,
  } = parsed.data;
  let dateRange: ReturnType<typeof resolveDateRange>;
  try {
    dateRange = resolveDateRange(
      from,
      to,
      Number(process.env.APP_TIME_ZONE_OFFSET_MINUTES ?? 420),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid date range." },
      { status: 400 },
    );
  }
  if (!process.env.DATABASE_URL)
    return NextResponse.json({
      data: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      mode: "demo",
    });
  const conditions: SQL[] = [];
  if (q)
    conditions.push(
      or(
        ilike(commercialBriefs.name, `%${q}%`),
        ilike(commercialBriefs.mainSubject, `%${q}%`),
        ilike(commercialBriefs.targetBuyer, `%${q}%`),
        ilike(commercialBriefs.targetMarket, `%${q}%`),
        ilike(opportunities.keyword, `%${q}%`),
      )!,
    );
  if (status) conditions.push(eq(commercialBriefs.status, status));
  if (orientation)
    conditions.push(eq(commercialBriefs.orientation, orientation));
  if (source === "manual")
    conditions.push(isNull(commercialBriefs.opportunityId));
  if (source === "opportunity")
    conditions.push(isNotNull(commercialBriefs.opportunityId));
  if (opportunity)
    conditions.push(eq(commercialBriefs.opportunityId, opportunity));
  conditions.push(...buildBriefUpdatedAtConditions(dateRange));
  const where = conditions.length ? and(...conditions) : undefined;
  const orderBy =
    sort === "oldest"
      ? asc(commercialBriefs.createdAt)
      : sort === "name_asc"
        ? asc(commercialBriefs.name)
        : sort === "name_desc"
          ? desc(commercialBriefs.name)
          : sort === "updated_asc"
            ? asc(commercialBriefs.updatedAt)
            : sort === "updated_desc"
              ? desc(commercialBriefs.updatedAt)
              : desc(commercialBriefs.createdAt);
  const db = getDb();
  const [{ total }] = await db
    .select({ total: count() })
    .from(commercialBriefs)
    .leftJoin(opportunities, eq(commercialBriefs.opportunityId, opportunities.id))
    .where(where);
  const totalPages = Math.ceil(total / pageSize);
  const resolvedPage = Math.min(page, Math.max(totalPages, 1));
  const rows = await db
    .select({
      id: commercialBriefs.id,
      opportunityId: commercialBriefs.opportunityId,
      opportunityKeyword: opportunities.keyword,
      name: commercialBriefs.name,
      targetBuyer: commercialBriefs.targetBuyer,
      intendedUsage: commercialBriefs.intendedUsage,
      targetMarket: commercialBriefs.targetMarket,
      mainSubject: commercialBriefs.mainSubject,
      supportingSubjects: commercialBriefs.supportingSubjects,
      environment: commercialBriefs.environment,
      visualStyle: commercialBriefs.visualStyle,
      orientation: commercialBriefs.orientation,
      composition: commercialBriefs.composition,
      copySpaceLocation: commercialBriefs.copySpaceLocation,
      lighting: commercialBriefs.lighting,
      mood: commercialBriefs.mood,
      representationNotes: commercialBriefs.representationNotes,
      prohibitedElements: commercialBriefs.prohibitedElements,
      candidateCount: commercialBriefs.candidateCount,
      status: commercialBriefs.status,
      generationPrompt: commercialBriefs.generationPrompt,
      negativePrompt: commercialBriefs.negativePrompt,
      metadataTitle: commercialBriefs.metadataTitle,
      metadataCategory: commercialBriefs.metadataCategory,
      metadataLanguage: commercialBriefs.metadataLanguage,
      metadataKeywords: commercialBriefs.metadataKeywords,
      metadataFictionalPeopleProperty:
        commercialBriefs.metadataFictionalPeopleProperty,
      metadataNotes: commercialBriefs.metadataNotes,
      createdAt: commercialBriefs.createdAt,
      updatedAt: commercialBriefs.updatedAt,
      successfulGenerationCount: sql<number>`(
        SELECT count(*)::int
        FROM ${generationJobs}
        WHERE ${generationJobs.briefId} = ${commercialBriefs.id}
          AND ${generationJobs.status} = 'succeeded'
      )`,
    })
    .from(commercialBriefs)
    .leftJoin(opportunities, eq(commercialBriefs.opportunityId, opportunities.id))
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((resolvedPage - 1) * pageSize);
  return NextResponse.json({
    data: rows,
    pagination: {
      page: resolvedPage,
      pageSize,
      total,
      totalPages,
    },
    mode: "database",
  });
}

async function post(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: "DATABASE_URL is required to save generated briefs." },
      { status: 409 },
    );
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid brief request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const db = getDb();
  const opportunity = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, parsed.data.opportunityId),
  });
  if (!opportunity)
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  const provider = createBriefGenerationProvider(parsed.data.provider);
  if (!provider.isConfigured())
    return NextResponse.json(
      { error: `${provider.label} is not configured on the server.` },
      { status: 409 },
    );
  try {
    const providerInput = {
      opportunity: {
        keyword: opportunity.keyword,
        targetRegion: opportunity.targetRegion,
        type: opportunity.type,
        scoreExplanation: opportunity.scoreExplanation,
      },
      count: parsed.data.count,
      preset: parsed.data.preset,
    };
    const generated = await observeProviderOperation(
      {
        generationJobId: null,
        sourcePath: request.nextUrl.pathname,
        idempotencyKey: `brief-generation:${crypto.randomUUID()}`,
        provider: provider.id,
        model: provider.model,
        operation: "brief_generation",
        estimatedCostUsd: null,
        requestBody: parsed.data,
        providerRequest: providerInput,
        summarizeResult: (briefs) => ({
          briefCount: briefs.length,
          briefNames: briefs.map((brief) => brief.name),
        }),
      },
      () => provider.generate(providerInput),
    );
    let created: (typeof commercialBriefs.$inferSelect)[];
    try {
      created = await db.transaction(async (tx) => {
        const rows = await tx
          .insert(commercialBriefs)
          .values(
            generated.map((brief) => ({
              opportunityId: opportunity.id,
              name: brief.name,
              targetBuyer: brief.targetBuyer,
              intendedUsage: brief.intendedUsage,
              targetMarket: brief.targetMarket,
              mainSubject: brief.mainSubject,
              supportingSubjects: splitList(brief.supportingSubjects),
              environment: brief.environment,
              visualStyle: brief.visualStyle,
              orientation: brief.orientation,
              composition: brief.composition,
              copySpaceLocation: brief.copySpaceLocation,
              lighting: brief.lighting,
              mood: brief.mood,
              representationNotes: brief.representationNotes,
              prohibitedElements: splitList(brief.prohibitedElements),
              candidateCount: 3,
              status: "ready" as const,
              generationPrompt: brief.generationPrompt,
              negativePrompt: brief.negativePrompt,
              metadataTitle: brief.metadataTitle,
              metadataCategory:
                normalizeAdobeCategory(brief.metadataCategory) ?? "",
              metadataLanguage: brief.metadataLanguage,
              metadataKeywords: splitMetadataKeywords(brief.metadataKeywords),
              metadataFictionalPeopleProperty:
                brief.metadataFictionalPeopleProperty,
              metadataNotes: brief.metadataNotes,
            })),
          )
          .returning();
        await tx
          .update(opportunities)
          .set({ status: "briefed", updatedAt: new Date() })
          .where(eq(opportunities.id, opportunity.id));
        return rows;
      });
    } catch (error) {
      appLogger.error("brief.persistence.failed", {
        error,
        provider: provider.id,
        model: provider.model,
        briefCount: generated.length,
        maxCopySpaceLocationLength: Math.max(
          ...generated.map((brief) => brief.copySpaceLocation.length),
        ),
      });
      return NextResponse.json(
        {
          error:
            "The briefs were generated but could not be saved. Apply the latest database migrations, then retry.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        data: created.map((brief) => ({
          ...brief,
          opportunityKeyword: opportunity.keyword,
        })),
        provider: provider.id,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Brief generation failed." },
      { status: 502 },
    );
  }
}

export const GET = withApiLogging(get);
export const POST = withApiLogging(post);
