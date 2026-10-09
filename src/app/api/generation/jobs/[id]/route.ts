import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { commercialBriefs, generationJobs } from "@/db/schema";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";

const actionSchema = z.object({
  action: z.literal("mark_interrupted"),
});

async function patch(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: "Database is not configured." },
      { status: 409 },
    );
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid recovery action." }, { status: 400 });
  const { id } = await context.params;
  const db = getDb();
  const job = await db.query.generationJobs.findFirst({
    where: eq(generationJobs.id, id),
  });
  if (!job)
    return NextResponse.json({ error: "Generation job not found." }, { status: 404 });
  if (job.status !== "running")
    return NextResponse.json(
      { error: "Only running jobs can be marked as interrupted." },
      { status: 409 },
    );
  if (Date.now() - job.updatedAt.getTime() < 15 * 60 * 1_000)
    return NextResponse.json(
      { error: "This job is still inside the 15-minute processing window." },
      { status: 409 },
    );

  const completedAt = new Date();
  const [updated] = await db
    .update(generationJobs)
    .set({
      status: "failed",
      progress: 0,
      failureKind: "unknown",
      errorDetails:
        "Processing was interrupted before Thoock received a final result. Review the provider log before retrying because charging status may be unknown.",
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(generationJobs.id, job.id))
    .returning();
  await db
    .update(commercialBriefs)
    .set({ status: "ready", updatedAt: completedAt })
    .where(eq(commercialBriefs.id, job.briefId));
  return NextResponse.json({ data: updated });
}

export const PATCH = withApiLogging(patch);
