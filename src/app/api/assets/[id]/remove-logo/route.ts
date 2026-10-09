import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { generatedAssets, generationJobs } from "@/db/schema";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import { removeSnapgenLogo } from "@/modules/assets/remove-snapgen-logo";
import { isSnapgenNanoModel } from "@/modules/providers/snapgen-logo-removal";

export const runtime = "nodejs";

async function post(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: "Logo-removal retry requires database mode." },
      { status: 409 },
    );

  const { id } = await context.params;
  const [asset] = await getDb()
    .select({
      id: generatedAssets.id,
      generationJobId: generatedAssets.generationJobId,
      providerRequestId: generatedAssets.providerRequestId,
      jobProviderRequestId: generationJobs.providerRequestId,
      candidateCount: generationJobs.candidateCount,
      provider: generationJobs.provider,
      model: generationJobs.model,
    })
    .from(generatedAssets)
    .innerJoin(
      generationJobs,
      eq(generatedAssets.generationJobId, generationJobs.id),
    )
    .where(eq(generatedAssets.id, id))
    .limit(1);
  if (!asset)
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  if (asset.provider !== "snapgen" || !isSnapgenNanoModel(asset.model))
    return NextResponse.json(
      { error: "Logo removal is available only for SnapGen Nano images." },
      { status: 409 },
    );
  const historyUuid =
    asset.providerRequestId ??
    (asset.candidateCount === 1 ? asset.jobProviderRequestId : null);
  if (!historyUuid)
    return NextResponse.json(
      {
        error:
          "This historical image does not have a candidate-specific SnapGen generation UUID.",
      },
      { status: 409 },
    );

  try {
    const derived = await removeSnapgenLogo({
      assetId: asset.id,
      generationJobId: asset.generationJobId,
      model: asset.model,
      historyUuid,
      idempotencyKey: `${asset.generationJobId}:logo:${asset.id}`,
      sourcePath: `/api/assets/${asset.id}/remove-logo`,
    });
    return NextResponse.json({
      data: {
        status: "completed",
        method: derived.method,
        derivedAssetId: derived.id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "SnapGenAI logo removal failed.",
        retryable: true,
      },
      { status: 502 },
    );
  }
}

export const POST = withApiLogging(post);
