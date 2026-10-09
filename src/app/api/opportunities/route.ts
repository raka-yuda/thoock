import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { opportunities } from "@/db/schema";
import {
  calculateOpportunityScore,
  explainOpportunityScore,
  opportunityInputSchema,
} from "@/lib/domain/opportunity";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import { dateOnlySchema, resolveDateRange } from "@/lib/domain/date-range";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(200).default(10),
  q: z.string().trim().max(120).optional(),
  type: z.enum(["evergreen", "seasonal", "trending"]).optional(),
  status: z
    .enum(["researching", "shortlisted", "briefed", "archived"])
    .optional(),
  region: z.string().trim().max(80).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  competition: z.enum(["lower", "moderate", "high"]).optional(),
  withoutBrief: z.coerce.boolean().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  sort: z
    .enum([
      "score_desc",
      "score_asc",
      "newest",
      "oldest",
      "competition_asc",
      "competition_desc",
    ])
    .default("score_desc"),
});

function startOfCurrentWeek(offsetMinutes: number, now = new Date()) {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - daysSinceMonday);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - offsetMinutes * 60_000);
}

async function get(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid opportunity filters", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const {
    page,
    pageSize,
    q,
    type,
    status,
    sort,
    from,
    to,
    region,
    minScore,
    maxScore,
    competition,
    withoutBrief,
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
      summary: {
        total: 0,
        researching: 0,
        shortlisted: 0,
        briefed: 0,
        weekly: { total: 0, researching: 0, shortlisted: 0, briefed: 0 },
      },
      mode: "demo",
    });
  const conditions: SQL[] = [];
  if (q)
    conditions.push(
      or(
        ilike(opportunities.keyword, `%${q}%`),
        ilike(opportunities.targetRegion, `%${q}%`),
      )!,
    );
  if (type) conditions.push(eq(opportunities.type, type));
  if (status) conditions.push(eq(opportunities.status, status));
  if (region) conditions.push(ilike(opportunities.targetRegion, `%${region}%`));
  if (minScore !== undefined)
    conditions.push(gte(opportunities.opportunityScore, String(minScore)));
  if (maxScore !== undefined)
    conditions.push(sql`${opportunities.opportunityScore} <= ${maxScore}`);
  if (competition === "lower")
    conditions.push(sql`${opportunities.adobeResultCount} < 25000`);
  if (competition === "moderate")
    conditions.push(
      sql`${opportunities.adobeResultCount} >= 25000 and ${opportunities.adobeResultCount} <= 100000`,
    );
  if (competition === "high")
    conditions.push(sql`${opportunities.adobeResultCount} > 100000`);
  if (withoutBrief)
    conditions.push(
      sql`not exists (select 1 from commercial_briefs brief where brief.opportunity_id = ${opportunities.id})`,
    );
  if (dateRange.start)
    conditions.push(gte(opportunities.createdAt, dateRange.start));
  if (dateRange.endExclusive)
    conditions.push(lt(opportunities.createdAt, dateRange.endExclusive));
  const where = conditions.length ? and(...conditions) : undefined;
  const orderBy =
    sort === "score_asc"
      ? asc(opportunities.opportunityScore)
      : sort === "newest"
        ? desc(opportunities.createdAt)
        : sort === "oldest"
          ? asc(opportunities.createdAt)
          : sort === "competition_asc"
            ? asc(opportunities.adobeResultCount)
            : sort === "competition_desc"
              ? desc(opportunities.adobeResultCount)
              : desc(opportunities.opportunityScore);
  const db = getDb();
  const weekStart = startOfCurrentWeek(
    Number(process.env.APP_TIME_ZONE_OFFSET_MINUTES ?? 420),
  );
  const [summaryRow] = await db
    .select({
      total: count(),
      researching: sql<number>`count(*) filter (where ${opportunities.status} = 'researching')`,
      shortlisted: sql<number>`count(*) filter (where ${opportunities.status} = 'shortlisted')`,
      briefed: sql<number>`count(*) filter (where ${opportunities.status} = 'briefed')`,
      weeklyTotal: sql<number>`count(*) filter (where ${opportunities.createdAt} >= ${weekStart})`,
      weeklyResearching: sql<number>`count(*) filter (where ${opportunities.createdAt} >= ${weekStart} and ${opportunities.status} = 'researching')`,
      weeklyShortlisted: sql<number>`count(*) filter (where ${opportunities.createdAt} >= ${weekStart} and ${opportunities.status} = 'shortlisted')`,
      weeklyBriefed: sql<number>`count(*) filter (where ${opportunities.createdAt} >= ${weekStart} and ${opportunities.status} = 'briefed')`,
    })
    .from(opportunities);
  const [{ total }] = await db
    .select({ total: count() })
    .from(opportunities)
    .where(where);
  const totalPages = Math.ceil(total / pageSize);
  const resolvedPage = Math.min(page, Math.max(totalPages, 1));
  return NextResponse.json({
    data: await db
      .select()
      .from(opportunities)
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((resolvedPage - 1) * pageSize),
    pagination: {
      page: resolvedPage,
      pageSize,
      total,
      totalPages,
    },
    summary: {
      total: Number(summaryRow.total),
      researching: Number(summaryRow.researching),
      shortlisted: Number(summaryRow.shortlisted),
      briefed: Number(summaryRow.briefed),
      weekly: {
        total: Number(summaryRow.weeklyTotal),
        researching: Number(summaryRow.weeklyResearching),
        shortlisted: Number(summaryRow.weeklyShortlisted),
        briefed: Number(summaryRow.weeklyBriefed),
      },
    },
    mode: "database",
  });
}
async function post(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = opportunityInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid opportunity", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const input = parsed.data;
  const record = {
    keyword: input.keyword,
    targetRegion: input.targetRegion,
    type: input.type,
    targetEventDate: input.targetEventDate || null,
    adobeResultCount: input.competition,
    trendGrowth: String(input.trendGrowth),
    commercialIntent: String(input.commercialIntent),
    seasonality: String(input.seasonality),
    portfolioPerformance: String(input.portfolioPerformance),
    opportunityScore: String(calculateOpportunityScore(input)),
    scoreExplanation: explainOpportunityScore(input),
  };
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { data: { id: crypto.randomUUID(), ...record }, mode: "demo" },
      { status: 201 },
    );
  const [created] = await getDb()
    .insert(opportunities)
    .values(record)
    .returning();
  return NextResponse.json(
    { data: created, mode: "database" },
    { status: 201 },
  );
}

export const GET = withApiLogging(get);
export const POST = withApiLogging(post);
