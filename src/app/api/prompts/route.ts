import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import { createPromptProvider } from "@/modules/providers/prompt";
import { observeProviderOperation } from "@/modules/providers/request-observability";

export const runtime = "nodejs";

const briefSchema = z.object({
  provider: z.enum(["mock-prompt", "gemini-prompt", "openai-prompt"]),
  brief: z.object({
    name: z.string().min(2).max(160),
    targetBuyer: z.string().min(2).max(500),
    intendedUsage: z.string().min(2).max(500),
    targetMarket: z.string().min(2).max(160),
    mainSubject: z.string().min(2).max(1_000),
    supportingSubjects: z.string().max(1_000),
    environment: z.string().min(2).max(500),
    visualStyle: z.string().min(2).max(500),
    orientation: z.string().min(2).max(40),
    composition: z.string().min(2).max(500),
    copySpaceLocation: z.string().min(2).max(100),
    lighting: z.string().min(2).max(500),
    mood: z.string().min(2).max(200),
    representationNotes: z.string().max(1_000),
    prohibitedElements: z.string().max(1_000),
  }),
});

async function post(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = briefSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid commercial brief", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const provider = createPromptProvider(parsed.data.provider);
  if (!provider.isConfigured())
    return NextResponse.json(
      { error: `${provider.label} is not configured on the server.` },
      { status: 409 },
    );
  try {
    const result = await observeProviderOperation(
      {
        generationJobId: null,
        sourcePath: request.nextUrl.pathname,
        idempotencyKey: `prompt-generation:${crypto.randomUUID()}`,
        provider: provider.id,
        model: provider.model,
        operation: "prompt_generation",
        estimatedCostUsd: null,
        requestBody: parsed.data,
        providerRequest: parsed.data.brief,
        summarizeResult: (generated) => ({
          promptLength: generated.prompt.length,
          negativePromptLength: generated.negativePrompt.length,
          rationale: generated.rationale,
        }),
      },
      () => provider.generate(parsed.data.brief),
    );
    return NextResponse.json({ data: result, provider: provider.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Prompt generation failed.",
      },
      { status: 502 },
    );
  }
}

export const POST = withApiLogging(post);
