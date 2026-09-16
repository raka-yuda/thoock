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
});
const topicsSchema = z.array(topicSchema).min(1).max(12);

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
  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  }
  async research(input: TopicResearchRequest): Promise<ResearchedTopic[]> {
    if (!this.isConfigured()) throw new Error("GEMINI_API_KEY is not configured.");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash",
      contents: `Act as a conservative commercial stock-image research assistant. Propose ${input.count} distinct, visually producible topics derived from ${JSON.stringify(input.seedTopic)} for ${input.targetRegion}. Topic behavior: ${input.type}. Portfolio context: ${input.portfolioContext || "none supplied"}. Return a JSON array. For each item provide keyword, type, optional targetEventDate, competitionEstimate, trendGrowth, commercialIntent, seasonality, portfolioPerformance, rationale, and buyerUseCases. Scores use 0-100. competitionEstimate is only a directional supply estimate—not live Adobe data or customer demand—so say that in each rationale. Avoid news claims, trademarks, famous people, copyrighted properties, and topics that cannot be represented safely in a commercial image.`,
      config: { responseMimeType: "application/json" },
    });
    return topicsSchema.parse(JSON.parse(response.text ?? "[]"));
  }
}

export function createTopicResearchProvider(id: string): TopicResearchProvider {
  const providers: TopicResearchProvider[] = [
    new MockTopicResearchProvider(),
    new GeminiTopicResearchProvider(),
  ];
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error(`Unknown topic research provider: ${id}`);
  return provider;
}

export { topicsSchema };
