import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { assetReviews, generatedAssets, qualityChecks } from "@/db/schema";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import { BASE_REVIEW_CHECKS } from "@/lib/domain/review";

const schema = z.object({
  decision: z.enum(["approved", "rejected", "regenerate"]),
  notes: z.string().trim().max(2_000).default(""),
  checks: z.record(z.string(), z.boolean()).default({}),
});

async function post(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json({ error: "Database is not configured." }, { status: 409 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid review", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const { id } = await context.params;
  const db = getDb();
  const asset = await db.query.generatedAssets.findFirst({
    where: eq(generatedAssets.id, id),
  });
  if (!asset)
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  const missing = BASE_REVIEW_CHECKS.filter((label) => !parsed.data.checks[label]);
  if (parsed.data.decision === "approved" && missing.length)
    return NextResponse.json(
      { error: "Complete every required human-review check before approval.", missing },
      { status: 409 },
    );
  const result = await db.transaction(async (tx) => {
    const [review] = await tx
      .insert(assetReviews)
      .values({
        generatedAssetId: asset.id,
        stage: "candidate",
        decision: parsed.data.decision,
        notes: parsed.data.notes,
        reviewedAt: new Date(),
      })
      .returning();
    await tx.insert(qualityChecks).values(
      BASE_REVIEW_CHECKS.map((label, index) => ({
        assetReviewId: review.id,
        checkKey: `base_${index + 1}`,
        label,
        passed: Boolean(parsed.data.checks[label]),
      })),
    );
    return review;
  });
  return NextResponse.json({ data: result }, { status: 201 });
}

export const POST = withApiLogging(post);
