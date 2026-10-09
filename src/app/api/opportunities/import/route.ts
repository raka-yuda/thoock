import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { opportunities, opportunitySignals } from "@/db/schema";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import {
  generateOpportunityCsvTemplate,
  parseOpportunityCsv,
  type OpportunityCsvError,
} from "@/lib/domain/opportunity-csv";
import { explainOpportunityScore } from "@/lib/domain/opportunity";

export const runtime = "nodejs";

const requestSchema = z.object({
  csv: z.string().min(1).max(1_000_000),
  commit: z.boolean().default(false),
});

async function get() {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return new NextResponse(generateOpportunityCsvTemplate(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="stock-research-template.csv"',
      "cache-control": "no-store",
    },
  });
}

async function post(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "Upload a CSV file no larger than 1MB." },
      { status: 400 },
    );
  if (Buffer.byteLength(body.data.csv, "utf8") > 1_000_000)
    return NextResponse.json(
      { error: "CSV must be no larger than 1MB." },
      { status: 413 },
    );

  const parsed = parseOpportunityCsv(body.data.csv);
  if (parsed.errors.length)
    return NextResponse.json(
      {
        error: "Fix the research CSV validation errors before importing.",
        data: previewPayload(parsed.rows, parsed.errors),
      },
      { status: 400 },
    );
  if (!body.data.commit)
    return NextResponse.json({ data: previewPayload(parsed.rows, []) });
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: "DATABASE_URL is required to import research topics." },
      { status: 409 },
    );

  const db = getDb();
  const existing = await db
    .select({
      keyword: opportunities.keyword,
      targetRegion: opportunities.targetRegion,
    })
    .from(opportunities);
  const existingKeys = new Set(
    existing.map((item) => topicKey(item.keyword, item.targetRegion)),
  );
  const duplicateErrors: OpportunityCsvError[] = parsed.rows
    .filter((row) =>
      existingKeys.has(topicKey(row.input.keyword, row.input.targetRegion)),
    )
    .map((row) => ({
      row: row.row,
      field: "keyword",
      message: "This topic and target region already exist in Opportunities.",
    }));
  if (duplicateErrors.length)
    return NextResponse.json(
      {
        error: "Some research topics already exist.",
        data: previewPayload(parsed.rows, duplicateErrors),
      },
      { status: 409 },
    );

  const created = await db.transaction(async (transaction) => {
    const inserted = [];
    for (const row of parsed.rows) {
      const scoreExplanation = [
        explainOpportunityScore(row.input),
        row.researchNotes,
      ]
        .filter(Boolean)
        .join(" ");
      const [opportunity] = await transaction
        .insert(opportunities)
        .values({
          keyword: row.input.keyword,
          targetRegion: row.input.targetRegion,
          type: row.input.type,
          targetEventDate: row.input.targetEventDate || null,
          adobeResultCount: row.input.competition,
          trendGrowth: String(row.input.trendGrowth),
          commercialIntent: String(row.input.commercialIntent),
          seasonality: String(row.input.seasonality),
          portfolioPerformance: String(row.input.portfolioPerformance),
          opportunityScore: String(row.score),
          scoreExplanation,
          status: "shortlisted",
        })
        .returning();
      await transaction.insert(opportunitySignals).values({
        opportunityId: opportunity.id,
        provider: "manual-csv-import",
        signalType: "external_chat_research",
        value: String(row.score),
        isEstimate: true,
        rawPayload: {
          researchNotes: row.researchNotes,
          buyerUseCases: row.buyerUseCases,
          researchSources: row.researchSources,
          competitionWarning:
            "Imported competition estimate represents available supply, not demand.",
          importedCsvRow: row.row,
        },
      });
      inserted.push(opportunity);
    }
    return inserted;
  });
  return NextResponse.json(
    {
      data: {
        ...previewPayload(parsed.rows, []),
        opportunities: created,
      },
    },
    { status: 201 },
  );
}

export const GET = withApiLogging(get);
export const POST = withApiLogging(post);

function topicKey(keyword: string, targetRegion: string) {
  return `${keyword.trim().toLocaleLowerCase()}\u0000${targetRegion.trim().toLocaleLowerCase()}`;
}

function previewPayload(
  rows: ReturnType<typeof parseOpportunityCsv>["rows"],
  errors: OpportunityCsvError[],
) {
  return {
    valid: errors.length === 0,
    rowCount: rows.length,
    rows: rows.map((row) => ({
      row: row.row,
      keyword: row.input.keyword,
      targetRegion: row.input.targetRegion,
      type: row.input.type,
      targetEventDate: row.input.targetEventDate ?? null,
      competitionEstimate: row.input.competition,
      trendGrowth: row.input.trendGrowth,
      commercialIntent: row.input.commercialIntent,
      seasonality: row.input.seasonality,
      portfolioPerformance: row.input.portfolioPerformance,
      score: row.score,
      researchNotes: row.researchNotes,
      buyerUseCases: row.buyerUseCases,
      researchSources: row.researchSources,
    })),
    errors,
  };
}
