import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type {
  ResearchedTopic,
  TopicResearchProvider,
  TopicResearchRequest,
} from "./contracts";

const topicSchema = z.object({
  keyword: z.string().min(3).max(120),
  type: z.enum(["evergreen", "seasonal", "trending"]),
  targetEventDate: z.string().optional(),
  competitionEstimate: z.number().int().min(0).max(1_000_000_000),
  trendGrowth: z.number().min(0).max(100),
  commercialIntent: z.number().min(0).max(100),
  seasonality: z.number().min(0).max(100),
  portfolioPerformance: z.number().min(0).max(100),
  rationale: z.string().min(10).max(1_000),
  buyerUseCases: z.array(z.string().min(2).max(200)).min(1).max(6),
  researchSources: z.array(z.url()).max(8).optional().default([]),
});
const topicsSchema = z.array(topicSchema).min(1).max(12);
const MAX_RESEARCH_RATIONALE_LENGTH = 1_000;

const openAIResponseSchema = z
  .object({
    output_text: z.string().nullable().optional(),
    output: z
      .array(
        z
          .object({
            type: z.string().optional(),
            content: z
              .array(
                z
                  .object({
                    type: z.string().optional(),
                    text: z.string().optional(),
                    refusal: z.string().optional(),
                    annotations: z
                      .array(
                        z
                          .object({
                            type: z.string().optional(),
                            url: z.string().optional(),
                            title: z.string().optional(),
                          })
                          .passthrough(),
                      )
                      .optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const openAITopicsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["topics"],
  properties: {
    topics: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "keyword",
          "type",
          "targetEventDate",
          "competitionEstimate",
          "trendGrowth",
          "commercialIntent",
          "seasonality",
          "portfolioPerformance",
          "rationale",
          "buyerUseCases",
          "researchSources",
        ],
        properties: {
          keyword: { type: "string", minLength: 3, maxLength: 120 },
          type: {
            type: "string",
            enum: ["evergreen", "seasonal", "trending"],
          },
          targetEventDate: {
            type: ["string", "null"],
            description:
              "A YYYY-MM-DD event date when relevant, otherwise null.",
          },
          competitionEstimate: {
            type: "integer",
            minimum: 0,
            maximum: 1_000_000_000,
          },
          trendGrowth: { type: "number", minimum: 0, maximum: 100 },
          commercialIntent: { type: "number", minimum: 0, maximum: 100 },
          seasonality: { type: "number", minimum: 0, maximum: 100 },
          portfolioPerformance: {
            type: "number",
            minimum: 0,
            maximum: 100,
          },
          rationale: {
            type: "string",
            minLength: 10,
            maxLength: MAX_RESEARCH_RATIONALE_LENGTH,
          },
          buyerUseCases: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string", minLength: 2, maxLength: 200 },
          },
          researchSources: {
            type: "array",
            maxItems: 8,
            items: {
              type: "string",
              pattern: "^https?://",
              description: "A direct HTTP or HTTPS source URL only.",
            },
          },
        },
      },
    },
  },
} as const;

function truncateResearchRationale(value: string) {
  if (value.length <= MAX_RESEARCH_RATIONALE_LENGTH) return value;
  return `${value
    .slice(0, MAX_RESEARCH_RATIONALE_LENGTH - 1)
    .trimEnd()}…`;
}

function extractHttpUrl(value: string) {
  const markdownUrl = value.match(/\]\((https?:\/\/[^)\s]+)\)/i)?.[1];
  const inlineUrl = value.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  const candidate = (markdownUrl ?? inlineUrl)?.replace(/[.,;:\]]+$/u, "");
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? candidate
      : null;
  } catch {
    return null;
  }
}

function normalizeResearchSources(values: string[], fallback: string[]) {
  const normalized = values
    .map(extractHttpUrl)
    .filter((value): value is string => Boolean(value));
  const selected = normalized.length ? normalized : fallback;
  return [
    ...new Set(
      selected
        .map(extractHttpUrl)
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 8);
}

function extractOpenAICitationUrls(value: unknown) {
  const response = openAIResponseSchema.parse(value);
  return [
    ...new Set(
      (response.output ?? [])
        .flatMap((item) => item.content ?? [])
        .flatMap((item) => item.annotations ?? [])
        .filter((annotation) => annotation.type === "url_citation")
        .map((annotation) => annotation.url ?? "")
        .map(extractHttpUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ];
}

const angles = [
  ["practical daily use", 77, 84, 66],
  ["small-business communication", 72, 91, 60],
  ["regional lifestyle", 81, 79, 74],
  ["sustainable alternative", 85, 82, 69],
  ["technology confidence", 78, 88, 62],
  ["wellness routine", 74, 86, 71],
] as const;

function stableNumber(value: string, minimum: number, range: number) {
  let hash = 2166136261;
  for (const character of value)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return minimum + ((hash >>> 0) % range);
}

export class MockTopicResearchProvider implements TopicResearchProvider {
  readonly id = "mock-research-ai";
  readonly label = "Deterministic research assistant";
  readonly model = "deterministic-research-v1";
  isConfigured() {
    return true;
  }
  async research(input: TopicResearchRequest): Promise<ResearchedTopic[]> {
    return Array.from({ length: input.count }, (_, index) => {
      const [angle, trend, intent, seasonal] = angles[index % angles.length];
      const keyword = `${input.seedTopic.trim()} — ${angle}`;
      return {
        keyword,
        type: input.type,
        competitionEstimate: stableNumber(
          `${keyword}:${input.targetRegion}`,
          8_000,
          92_000,
        ),
        trendGrowth: trend,
        commercialIntent: intent,
        seasonality: input.type === "seasonal" ? Math.max(82, seasonal) : seasonal,
        portfolioPerformance: input.portfolioContext ? 68 : 50,
        rationale: `A distinct ${angle} angle for ${input.targetRegion}, framed around reusable commercial communication rather than a one-off decorative image. Competition is a mock estimate and must be verified against Adobe Stock search.`,
        buyerUseCases: [
          "website hero",
          "social campaign",
          "presentation or editorial support",
        ],
      };
    });
  }
}

export class GeminiTopicResearchProvider implements TopicResearchProvider {
  readonly id = "gemini-research-ai";
  readonly label = "Gemini research assistant";
  get model() {
    return process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
  }
  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  }
  async research(input: TopicResearchRequest): Promise<ResearchedTopic[]> {
    if (!this.isConfigured()) throw new Error("GEMINI_API_KEY is not configured.");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: this.model,
      contents: `Act as a conservative commercial stock-image research assistant. Propose ${input.count} distinct, visually producible topics derived from ${JSON.stringify(input.seedTopic)} for ${input.targetRegion}. Topic behavior: ${input.type}. Portfolio context: ${input.portfolioContext || "none supplied"}. Return a JSON array. For each item provide keyword, type, optional targetEventDate, competitionEstimate, trendGrowth, commercialIntent, seasonality, portfolioPerformance, rationale, and buyerUseCases. Scores use 0-100. competitionEstimate is only a directional supply estimate—not live Adobe data or customer demand—so say that in each rationale. Avoid news claims, trademarks, famous people, copyrighted properties, and topics that cannot be represented safely in a commercial image.`,
      config: { responseMimeType: "application/json" },
    });
    return topicsSchema.parse(JSON.parse(response.text ?? "[]"));
  }
}

function extractOpenAIOutputText(value: unknown) {
  const response = openAIResponseSchema.parse(value);
  if (response.output_text?.trim()) return response.output_text;
  const text = response.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("");
  if (text?.trim()) return text;
  const refusal = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "refusal" && item.refusal)?.refusal;
  throw new Error(refusal || "OpenAI returned no text research result.");
}

function openAIErrorMessage(value: unknown, status: number) {
  const parsed = z
    .object({ error: z.object({ message: z.string() }).optional() })
    .safeParse(value);
  return parsed.success && parsed.data.error?.message
    ? `OpenAI research failed with status ${status}: ${parsed.data.error.message}`
    : `OpenAI research failed with status ${status}.`;
}

export class OpenAITopicResearchProvider implements TopicResearchProvider {
  readonly id = "openai-research-ai";
  readonly label = "OpenAI research assistant";
  get model() {
    return process.env.OPENAI_RESEARCH_MODEL ?? "gpt-5.6-luna";
  }

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async research(input: TopicResearchRequest): Promise<ResearchedTopic[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

    const model = this.model;
    const baseUrl = (process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1")
      .replace(/\/+$/, "");
    const useWebSearch = process.env.OPENAI_RESEARCH_WEB_SEARCH !== "false";
    const timeout = Number(process.env.OPENAI_RESEARCH_TIMEOUT_MS ?? "120000");
    const requestBody = {
      model,
      store: false,
      instructions:
        "You are a conservative commercial stock-image opportunity researcher. Return evidence-aware, visually producible topics, not sales guarantees. Scores and competition counts are estimates, never Adobe sales data. Avoid trademarks, famous people, copyrighted properties, misleading news scenes, and concepts that cannot be represented safely in a commercial image.",
      input: `Research exactly ${input.count} meaningfully distinct stock-image topic opportunities derived from ${JSON.stringify(input.seedTopic)} for ${JSON.stringify(input.targetRegion)}. Required topic behavior: ${input.type}. Portfolio context: ${input.portfolioContext || "none supplied"}. Today is ${new Date().toISOString().slice(0, 10)}. ${useWebSearch ? "Use web search for current regional, seasonal, buyer, and trend evidence." : "Web search is disabled; clearly qualify evidence limitations."} For every topic, make competitionEstimate a rounded directional estimate of available supply rather than demand, explain its basis and uncertainty in a concise rationale of at most ${MAX_RESEARCH_RATIONALE_LENGTH} characters, score each factor from 0 to 100, and include only direct HTTP or HTTPS source URLs in researchSources—never citation labels, titles, or Markdown links. Use portfolioPerformance=50 when the supplied portfolio context gives no evidence for another value.`,
      max_output_tokens: 8_000,
      text: {
        format: {
          type: "json_schema",
          name: "stock_topic_research",
          strict: true,
          schema: openAITopicsJsonSchema,
        },
      },
      ...(useWebSearch ? { tools: [{ type: "web_search" }] } : {}),
    };

    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(
        Number.isFinite(timeout) && timeout > 0 ? timeout : 120_000,
      ),
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(openAIErrorMessage(payload, response.status));

    const citationUrls = extractOpenAICitationUrls(payload);
    const parsed = z
      .object({
        topics: z.array(
          topicSchema.extend({
            targetEventDate: z.string().nullable().optional(),
            rationale: z.string().min(10),
            researchSources: z.array(z.string()).max(8).optional().default([]),
          }),
        ),
      })
      .parse(JSON.parse(extractOpenAIOutputText(payload)));
    if (parsed.topics.length !== input.count)
      throw new Error(
        `OpenAI returned ${parsed.topics.length} topics; expected ${input.count}.`,
      );
    return topicsSchema.parse(
      parsed.topics.map((topic) => ({
        ...topic,
        targetEventDate: topic.targetEventDate || undefined,
        rationale: truncateResearchRationale(topic.rationale),
        researchSources: normalizeResearchSources(
          topic.researchSources,
          citationUrls,
        ),
      })),
    );
  }
}

export function createTopicResearchProvider(id: string): TopicResearchProvider {
  const providers: TopicResearchProvider[] = [
    new MockTopicResearchProvider(),
    new GeminiTopicResearchProvider(),
    new OpenAITopicResearchProvider(),
  ];
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error(`Unknown topic research provider: ${id}`);
  return provider;
}

export { extractOpenAIOutputText, openAITopicsJsonSchema, topicsSchema };
