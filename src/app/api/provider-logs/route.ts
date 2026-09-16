import { and, asc, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { providerRequestLogs } from "@/db/schema";
import { readSession } from "@/lib/auth";
import { dateOnlySchema, resolveDateRange } from "@/lib/domain/date-range";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional(),
  status: z.enum(["started", "succeeded", "failed"]).optional(),
  provider: z.string().trim().min(1).max(60).optional(),
  job: z.string().uuid().optional(),
  q: z.string().trim().max(160).optional(),
  operation: z.string().trim().min(1).max(60).optional(),
  model: z.string().trim().min(1).max(160).optional(),
  requestType: z.enum(["free", "paid", "unknown"]).optional(),
  minDuration: z.coerce.number().int().min(0).optional(),
  maxDuration: z.coerce.number().int().min(0).optional(),
  errors: z.coerce.boolean().optional(),
  missingUuid: z.coerce.boolean().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  sort: z.enum(["newest", "oldest", "duration_asc", "duration_desc"]).default("newest"),
});

export async function GET(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid provider-log filters", issues: parsed.error.flatten() },
      { status: 400 },
    );

  const pageSize = parsed.data.pageSize ?? parsed.data.limit ?? 10;
  if (!process.env.DATABASE_URL)
    return NextResponse.json({
      data: [],
      pagination: { page: parsed.data.page, pageSize, total: 0, totalPages: 0 },
      facets: { providers: [], models: [] },
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

  const conditions: SQL[] = [
    parsed.data.status ? eq(providerRequestLogs.status, parsed.data.status) : undefined,
    parsed.data.provider ? eq(providerRequestLogs.provider, parsed.data.provider) : undefined,
    parsed.data.job ? eq(providerRequestLogs.generationJobId, parsed.data.job) : undefined,
    parsed.data.q
      ? or(
          ilike(providerRequestLogs.provider, `%${parsed.data.q}%`),
          ilike(providerRequestLogs.model, `%${parsed.data.q}%`),
          ilike(providerRequestLogs.operation, `%${parsed.data.q}%`),
          ilike(providerRequestLogs.idempotencyKey, `%${parsed.data.q}%`),
        )
      : undefined,
    parsed.data.operation ? eq(providerRequestLogs.operation, parsed.data.operation) : undefined,
    parsed.data.model ? eq(providerRequestLogs.model, parsed.data.model) : undefined,
    parsed.data.requestType === "paid"
      ? sql`${providerRequestLogs.estimatedCostUsd} > 0`
      : parsed.data.requestType === "free"
        ? sql`${providerRequestLogs.estimatedCostUsd} = 0`
        : parsed.data.requestType === "unknown"
          ? sql`${providerRequestLogs.estimatedCostUsd} is null`
          : undefined,
    parsed.data.minDuration !== undefined
      ? gte(providerRequestLogs.durationMs, parsed.data.minDuration)
      : undefined,
    parsed.data.maxDuration !== undefined
      ? sql`${providerRequestLogs.durationMs} <= ${parsed.data.maxDuration}`
      : undefined,
    parsed.data.errors ? eq(providerRequestLogs.status, "failed") : undefined,
    parsed.data.missingUuid
      ? sql`cardinality(${providerRequestLogs.providerRequestIds}) = 0`
      : undefined,
    dateRange.start ? gte(providerRequestLogs.createdAt, dateRange.start) : undefined,
    dateRange.endExclusive ? lt(providerRequestLogs.createdAt, dateRange.endExclusive) : undefined,
  ].filter((condition): condition is SQL => condition !== undefined);

  const db = getDb();
  const where = conditions.length ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(providerRequestLogs).where(where);
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(parsed.data.page, Math.max(totalPages, 1));
  const orderBy =
    parsed.data.sort === "oldest"
      ? asc(providerRequestLogs.createdAt)
      : parsed.data.sort === "duration_asc"
        ? asc(providerRequestLogs.durationMs)
        : parsed.data.sort === "duration_desc"
          ? desc(providerRequestLogs.durationMs)
          : desc(providerRequestLogs.createdAt);

  const [rows, providerRows, modelRows] = await Promise.all([
    db
      .select()
      .from(providerRequestLogs)
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.selectDistinct({ value: providerRequestLogs.provider }).from(providerRequestLogs),
    db.selectDistinct({ value: providerRequestLogs.model }).from(providerRequestLogs),
  ]);

  return NextResponse.json({
    data: rows,
    pagination: { page, pageSize, total, totalPages },
    facets: {
      providers: providerRows.map((row) => row.value).sort(),
      models: modelRows.map((row) => row.value).sort(),
    },
    mode: "database",
  });
}
