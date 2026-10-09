import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { commercialBriefs } from "@/db/schema";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import { commercialBriefInputSchema } from "@/lib/domain/commercial-brief";

const updateSchema = commercialBriefInputSchema.extend({
  status: z.enum(["draft", "ready", "generating", "complete", "archived"]),
  generationPrompt: z.string().trim().min(10).max(10_000),
  negativePrompt: z.string().trim().max(10_000),
}).omit({ opportunityId: true });

async function patch(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json({ error: "Database is not configured." }, { status: 409 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid brief", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const { id } = await context.params;
  const [updated] = await getDb()
    .update(commercialBriefs)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(commercialBriefs.id, id))
    .returning();
  if (!updated)
    return NextResponse.json({ error: "Brief not found." }, { status: 404 });
  return NextResponse.json({ data: updated });
}

export const PATCH = withApiLogging(patch);
