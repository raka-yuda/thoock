import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { commercialBriefs, opportunities } from "@/db/schema";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import {
  commercialBriefInputSchema,
  completeBriefPrompts,
} from "@/lib/domain/commercial-brief";

async function post(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: "DATABASE_URL is required to save a manual brief." },
      { status: 409 },
    );
  const parsed = commercialBriefInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Complete the required brief fields.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const input = parsed.data;
  const db = getDb();
  let opportunityKeyword: string | null = null;
  if (input.opportunityId) {
    const opportunity = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, input.opportunityId),
    });
    if (!opportunity)
      return NextResponse.json({ error: "Source opportunity not found." }, { status: 404 });
    opportunityKeyword = opportunity.keyword;
  }
  const { generationPrompt, negativePrompt } = completeBriefPrompts(input);
  const [created] = await db
    .insert(commercialBriefs)
    .values({
      ...input,
      opportunityId: input.opportunityId || null,
      generationPrompt,
      negativePrompt,
      status: "draft",
    })
    .returning();
  if (input.opportunityId)
    await db
      .update(opportunities)
      .set({ status: "briefed", updatedAt: new Date() })
      .where(eq(opportunities.id, input.opportunityId));
  return NextResponse.json(
    { data: { ...created, opportunityKeyword } },
    { status: 201 },
  );
}

export const POST = withApiLogging(post);
