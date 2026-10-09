import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { opportunities, opportunitySignals } from "@/db/schema";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import {
  calculateOpportunityScore,
  explainOpportunityScore,
  type OpportunityInput,
} from "@/lib/domain/opportunity";
import { createTopicResearchProvider } from "@/modules/providers/research-ai";
import { observeProviderOperation } from "@/modules/providers/request-observability";

export const runtime = "nodejs";

const schema = z.object({
  provider: z.enum([
    "mock-research-ai",
    "gemini-research-ai",
    "openai-research-ai",
  ]),
  seedTopic: z.string().trim().min(2).max(200),
  targetRegion: z.string().trim().min(2).max(80),
  type: z.enum(["evergreen", "seasonal", "trending"]),
  count: z.coerce.number().int().min(1).max(12).default(5),
  portfolioContext: z.string().trim().max(2_000).optional(),
});

async function post(request: NextRequest) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid research request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  const provider = createTopicResearchProvider(parsed.data.provider);
  if (!provider.isConfigured())
    return NextResponse.json(
      { error: `${provider.label} is not configured on the server.` },
      { status: 409 },
    );
  try {
    const researched = await observeProviderOperation(
      {
        generationJobId: null,
        sourcePath: request.nextUrl.pathname,
        idempotencyKey: `topic-research:${crypto.randomUUID()}`,
        provider: provider.id,
        model: provider.model,
        operation: "topic_research",
        estimatedCostUsd: null,
        requestBody: parsed.data,
        providerRequest: {
          model: provider.model,
          seedTopic: parsed.data.seedTopic,
          targetRegion: parsed.data.targetRegion,
          type: parsed.data.type,
          count: parsed.data.count,
          portfolioContext: parsed.data.portfolioContext ?? null,
          webSearchEnabled:
            provider.id === "openai-research-ai"
              ? process.env.OPENAI_RESEARCH_WEB_SEARCH !== "false"
              : null,
        },
        summarizeResult: (topics) => ({
          topicCount: topics.length,
          topics,
        }),
      },
      () => provider.research(parsed.data),
    );
    const records = researched.map((topic) => {
      const input: OpportunityInput = {
        keyword: topic.keyword,
        targetRegion: parsed.data.targetRegion,
        type: topic.type,
        targetEventDate: topic.targetEventDate,
        competition: topic.competitionEstimate,
        trendGrowth: topic.trendGrowth,
        commercialIntent: topic.commercialIntent,
        seasonality: topic.seasonality,
        portfolioPerformance: topic.portfolioPerformance,
      };
      return {
        input,
        rationale: topic.rationale,
        buyerUseCases: topic.buyerUseCases,
        researchSources: topic.researchSources ?? [],
        score: calculateOpportunityScore(input),
      };
    });
    if (!process.env.DATABASE_URL)
      return NextResponse.json(
        {
          data: records.map(
            ({ input, rationale, buyerUseCases, researchSources, score }) => ({
              id: crypto.randomUUID(),
              keyword: input.keyword,
              targetRegion: input.targetRegion,
              type: input.type,
              adobeResultCount: input.competition,
              trendGrowth: String(input.trendGrowth),
              commercialIntent: String(input.commercialIntent),
              seasonality: String(input.seasonality),
              portfolioPerformance: String(input.portfolioPerformance),
              opportunityScore: String(score),
              scoreExplanation: `${explainOpportunityScore(input)} ${rationale}`,
              status: "shortlisted",
              researchRationale: rationale,
              buyerUseCases,
              researchSources,
            }),
          ),
          mode: "unpersisted-demo",
        },
        { status: 201 },
      );
    const db = getDb();
    const created = await db.transaction(async (tx) => {
      const result = [];
      for (const record of records) {
        const [opportunity] = await tx
          .insert(opportunities)
          .values({
            keyword: record.input.keyword,
            targetRegion: record.input.targetRegion,
            type: record.input.type,
            targetEventDate: record.input.targetEventDate || null,
            adobeResultCount: record.input.competition,
            trendGrowth: String(record.input.trendGrowth),
            commercialIntent: String(record.input.commercialIntent),
            seasonality: String(record.input.seasonality),
            portfolioPerformance: String(record.input.portfolioPerformance),
            opportunityScore: String(record.score),
            scoreExplanation: `${explainOpportunityScore(record.input)} ${record.rationale}`,
            status: "shortlisted",
          })
          .returning();
        await tx.insert(opportunitySignals).values({
          opportunityId: opportunity.id,
          provider: provider.id,
          signalType: "ai_topic_research",
          value: String(record.score),
          isEstimate: true,
          rawPayload: {
            rationale: record.rationale,
            buyerUseCases: record.buyerUseCases,
            researchSources: record.researchSources,
            competitionWarning:
              "Directional supply estimate; not live Adobe demand data",
          },
        });
        result.push(opportunity);
      }
      return result;
    });
    return NextResponse.json(
      { data: created, provider: provider.id, mode: "database" },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Research failed." },
      { status: 502 },
    );
  }
}

export const POST = withApiLogging(post);
