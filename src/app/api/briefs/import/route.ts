import { inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { commercialBriefs, opportunities } from "@/db/schema";
import { readSession } from "@/lib/auth";
import {
  generateBriefCsvTemplate,
  parseBriefCsv,
  type BriefCsvError,
} from "@/lib/domain/brief-csv";
import { completeBriefPrompts } from "@/lib/domain/commercial-brief";

export const runtime = "nodejs";

const requestSchema = z.object({
  csv: z.string().min(1).max(1_000_000),
  commit: z.boolean().default(false),
});

export async function GET() {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return new NextResponse(generateBriefCsvTemplate(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="commercial-briefs-template.csv"',
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: NextRequest) {
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

  const parsed = parseBriefCsv(body.data.csv);
  if (parsed.errors.length)
    return NextResponse.json(
      {
        error: "Fix the CSV validation errors before importing.",
        data: previewPayload(parsed.rows, parsed.errors),
      },
      { status: 400 },
    );
  if (!body.data.commit)
    return NextResponse.json({ data: previewPayload(parsed.rows, []) });
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: "DATABASE_URL is required to import briefs." },
      { status: 409 },
    );

  const db = getDb();
  const requestedKeywords = [
    ...new Set(
      parsed.rows
        .map((row) => row.opportunityKeyword?.toLocaleLowerCase())
        .filter((keyword): keyword is string => Boolean(keyword)),
    ),
  ];
  const opportunityRows = requestedKeywords.length
    ? await db
        .select({ id: opportunities.id, keyword: opportunities.keyword })
        .from(opportunities)
    : [];
  const opportunityByKeyword = new Map(
    opportunityRows.map((item) => [item.keyword.trim().toLocaleLowerCase(), item]),
  );
  const opportunityErrors: BriefCsvError[] = [];
  for (const row of parsed.rows) {
    if (
      row.opportunityKeyword &&
      !opportunityByKeyword.has(row.opportunityKeyword.toLocaleLowerCase())
    )
      opportunityErrors.push({
        row: row.row,
        field: "opportunity_keyword",
        message: `No saved opportunity matches “${row.opportunityKeyword}”. Leave it blank to import as a manual brief.`,
      });
  }
  if (opportunityErrors.length)
    return NextResponse.json(
      {
        error: "Some source opportunities could not be matched.",
        data: previewPayload(parsed.rows, opportunityErrors),
      },
      { status: 400 },
    );

  const values = parsed.rows.map((row) => {
    const opportunity = row.opportunityKeyword
      ? opportunityByKeyword.get(row.opportunityKeyword.toLocaleLowerCase())
      : null;
    return {
      ...row.brief,
      ...completeBriefPrompts(row.brief),
      opportunityId: opportunity?.id ?? null,
      status: "draft" as const,
    };
  });
  const opportunityIds = [
    ...new Set(
      values
        .map((value) => value.opportunityId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const created = await db.transaction(async (transaction) => {
    const inserted = await transaction
      .insert(commercialBriefs)
      .values(values)
      .returning();
    if (opportunityIds.length)
      await transaction
        .update(opportunities)
        .set({ status: "briefed", updatedAt: new Date() })
        .where(inArray(opportunities.id, opportunityIds));
    return inserted;
  });
  const keywordByOpportunityId = new Map(
    opportunityRows.map((item) => [item.id, item.keyword]),
  );
  return NextResponse.json(
    {
      data: {
        ...previewPayload(parsed.rows, []),
        briefs: created.map((brief) => ({
          ...brief,
          opportunityKeyword: brief.opportunityId
            ? (keywordByOpportunityId.get(brief.opportunityId) ?? null)
            : null,
        })),
      },
    },
    { status: 201 },
  );
}

function previewPayload(
  rows: ReturnType<typeof parseBriefCsv>["rows"],
  errors: BriefCsvError[],
) {
  return {
    valid: errors.length === 0,
    rowCount: rows.length,
    rows: rows.map((row) => ({
      row: row.row,
      name: row.brief.name,
      mainSubject: row.brief.mainSubject,
      targetMarket: row.brief.targetMarket,
      orientation: row.brief.orientation,
      candidateCount: row.brief.candidateCount,
      metadataCategory: row.brief.metadataCategory,
      opportunityKeyword: row.opportunityKeyword,
    })),
    errors,
  };
}
