import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import { enforceMonthlyBudget } from "@/lib/domain/cost";
import { decideUpscale } from "@/lib/domain/image";
import { MockImageGenerationProvider } from "@/modules/providers/generation";
import { SharpInspectionProvider } from "@/modules/providers/inspection";
import { LocalStorageProvider } from "@/modules/providers/storage";
export const runtime = "nodejs";
const schema = z.object({
  prompt: z.string().min(10).max(10000),
  negativePrompt: z.string().max(10000).optional(),
  width: z.number().int().min(512).max(4096),
  height: z.number().int().min(512).max(4096),
  candidates: z.number().int().min(1).max(6),
  idempotencyKey: z.string().min(8).max(100),
});
async function post(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid generation request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const budget = enforceMonthlyBudget({
    spentUsd: 0,
    estimateUsd: 0,
    monthlyLimitIdr: 500000,
    usdToIdr: 16250,
  });
  if (!budget.allowed)
    return NextResponse.json(
      { error: "Monthly budget reached" },
      { status: 402 },
    );
  const provider = new MockImageGenerationProvider();
  const images = await provider.generate({
    prompt: parsed.data.prompt,
    negativePrompt: parsed.data.negativePrompt,
    model: "mock-v1",
    requestedWidth: parsed.data.width,
    requestedHeight: parsed.data.height,
    candidates: parsed.data.candidates,
    aspectRatio: "4:3",
    resolution: parsed.data.width >= 2300 ? "direct-4mp" : "economical",
  });
  const storage = new LocalStorageProvider();
  const inspector = new SharpInspectionProvider();
  const jobId = randomUUID();
  const assets = await Promise.all(
    images.map(async (image, index) => {
      const inspection = await inspector.inspect(image.buffer);
      const key = `generated/${jobId}/candidate-${index + 1}.jpg`;
      await storage.put(key, image.buffer, image.mimeType);
      return {
        id: randomUUID(),
        storageKey: key,
        providerReportedWidth: image.providerReportedWidth,
        providerReportedHeight: image.providerReportedHeight,
        ...inspection,
        upscale: decideUpscale(inspection.width, inspection.height),
        providerRequestId: image.providerRequestId,
      };
    }),
  );
  return NextResponse.json(
    {
      data: { id: jobId, status: "succeeded", estimatedCostUsd: 0, assets },
      mode: "mock",
    },
    { status: 201 },
  );
}

export const POST = withApiLogging(post);
