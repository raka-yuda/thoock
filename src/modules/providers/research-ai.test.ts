import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MockTopicResearchProvider,
  OpenAITopicResearchProvider,
  extractOpenAIOutputText,
  openAITopicsJsonSchema,
} from "./research-ai";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("MockTopicResearchProvider", () => {
  it("returns distinct, explainable topic opportunities", async () => {
    const provider = new MockTopicResearchProvider();
    const result = await provider.research({
      seedTopic: "healthy meal planning",
      targetRegion: "Indonesia",
      type: "evergreen",
      count: 4,
    });
    expect(result).toHaveLength(4);
    expect(new Set(result.map((item) => item.keyword)).size).toBe(4);
    expect(result.every((item) => item.rationale.includes("estimate"))).toBe(true);
    expect(result.every((item) => item.commercialIntent >= 0 && item.commercialIntent <= 100)).toBe(true);
  });
});

describe("OpenAITopicResearchProvider", () => {
  it("uses the Responses API with web search and normalizes structured output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-secret");
    vi.stubEnv("OPENAI_API_BASE_URL", "https://openai.example.test/v1/");
    vi.stubEnv("OPENAI_RESEARCH_MODEL", "research-model");
    vi.stubEnv("OPENAI_RESEARCH_WEB_SEARCH", "true");
    const calls: Array<{
      url: string;
      authorization: string | null;
      body: Record<string, unknown>;
    }> = [];
    const topics = [
      {
        keyword: "Indonesian heat-safe outdoor work break",
        type: "seasonal",
        targetEventDate: null,
        competitionEstimate: 25_000,
        trendGrowth: 78,
        commercialIntent: 84,
        seasonality: 89,
        portfolioPerformance: 50,
        rationale:
          "A directional supply estimate for a commercially useful workplace-safety scene; verify the Adobe result count manually.",
        buyerUseCases: ["workplace safety campaign", "insurance article"],
        researchSources: ["https://example.test/regional-heat-guidance"],
      },
      {
        keyword: "Tropical small business hydration routine",
        type: "seasonal",
        targetEventDate: null,
        competitionEstimate: 50_000,
        trendGrowth: 74,
        commercialIntent: 81,
        seasonality: 87,
        portfolioPerformance: 50,
        rationale:
          "A rounded supply estimate for a distinct small-business wellness use case; verify it against Adobe Stock search.",
        buyerUseCases: ["small-business training", "health campaign"],
        researchSources: ["https://example.test/workplace-wellness"],
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push({
          url: String(input),
          authorization: headers.get("authorization"),
          body,
        });
        return Response.json({
          id: "resp_research_1",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ topics }),
                },
              ],
            },
          ],
        });
      }),
    );

    const result = await new OpenAITopicResearchProvider().research({
      seedTopic: "outdoor worker health",
      targetRegion: "Indonesia",
      type: "seasonal",
      count: 2,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://openai.example.test/v1/responses",
      authorization: "Bearer openai-test-secret",
      body: {
        model: "research-model",
        store: false,
        tools: [{ type: "web_search" }],
        text: {
          format: {
            type: "json_schema",
            name: "stock_topic_research",
            strict: true,
          },
        },
      },
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      keyword: "Indonesian heat-safe outdoor work break",
      targetEventDate: undefined,
      researchSources: ["https://example.test/regional-heat-guidance"],
    });
  });

  it("can disable web search without changing the normalized contract", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-secret");
    vi.stubEnv("OPENAI_RESEARCH_WEB_SEARCH", "false");
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).not.toHaveProperty("tools");
      return Response.json({
        output_text: JSON.stringify({
          topics: [
            {
              keyword: "Regional reusable packaging routine",
              type: "evergreen",
              targetEventDate: null,
              competitionEstimate: 10_000,
              trendGrowth: 70,
              commercialIntent: 80,
              seasonality: 55,
              portfolioPerformance: 50,
              rationale:
                "A model-only directional estimate that requires manual source and Adobe supply verification.",
              buyerUseCases: ["sustainability campaign"],
              researchSources: [],
            },
          ],
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAITopicResearchProvider().research({
      seedTopic: "reusable packaging",
      targetRegion: "Southeast Asia",
      type: "evergreen",
      count: 1,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result[0].researchSources).toEqual([]);
  });

  it("constrains and safely normalizes an oversized research rationale", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-secret");
    vi.stubEnv("OPENAI_RESEARCH_WEB_SEARCH", "false");
    const oversizedRationale = `${"Detailed evidence and uncertainty. ".repeat(40)}End.`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          output_text: JSON.stringify({
            topics: [
              {
                keyword: "Commercial heat-safety hydration break",
                type: "seasonal",
                targetEventDate: null,
                competitionEstimate: 25_000,
                trendGrowth: 78,
                commercialIntent: 84,
                seasonality: 89,
                portfolioPerformance: 50,
                rationale: oversizedRationale,
                buyerUseCases: ["workplace safety campaign"],
                researchSources: [],
              },
            ],
          }),
        })),
    );

    const result = await new OpenAITopicResearchProvider().research({
      seedTopic: "outdoor worker health",
      targetRegion: "Indonesia",
      type: "seasonal",
      count: 1,
    });

    expect(result[0].rationale.length).toBeLessThanOrEqual(1_000);
    expect(result[0].rationale.endsWith("…")).toBe(true);
    expect(
      openAITopicsJsonSchema.properties.topics.items.properties.rationale,
    ).toMatchObject({ maxLength: 1_000 });
  });

  it("keeps usable HTTP sources and falls back to native web citations", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-secret");
    vi.stubEnv("OPENAI_RESEARCH_WEB_SEARCH", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "resp_research_sources",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    topics: [
                      {
                        keyword: "Regional workplace heat-safety break",
                        type: "seasonal",
                        targetEventDate: null,
                        competitionEstimate: 25_000,
                        trendGrowth: 78,
                        commercialIntent: 84,
                        seasonality: 89,
                        portfolioPerformance: 50,
                        rationale:
                          "A directional supply estimate for a useful workplace-safety campaign.",
                        buyerUseCases: ["workplace safety campaign"],
                        researchSources: [
                          "[Regional guidance](https://example.test/heat-guidance)",
                          "Regional labor report",
                        ],
                      },
                      {
                        keyword: "Small business hydration routine",
                        type: "seasonal",
                        targetEventDate: null,
                        competitionEstimate: 30_000,
                        trendGrowth: 74,
                        commercialIntent: 80,
                        seasonality: 86,
                        portfolioPerformance: 50,
                        rationale:
                          "A distinct commercial wellness scene with a directional supply estimate.",
                        buyerUseCases: ["small-business training"],
                        researchSources: ["[1]", "Workplace wellness source"],
                      },
                    ],
                  }),
                  annotations: [
                    {
                      type: "url_citation",
                      url: "https://example.test/native-citation",
                      title: "Native citation",
                    },
                  ],
                },
              ],
            },
          ],
        })),
    );

    const result = await new OpenAITopicResearchProvider().research({
      seedTopic: "worker wellness",
      targetRegion: "Indonesia",
      type: "seasonal",
      count: 2,
    });

    expect(result[0].researchSources).toEqual([
      "https://example.test/heat-guidance",
    ]);
    expect(result[1].researchSources).toEqual([
      "https://example.test/native-citation",
    ]);
    expect(
      openAITopicsJsonSchema.properties.topics.items.properties.researchSources
        .items,
    ).toMatchObject({ pattern: "^https?://" });
  });

  it("surfaces refusals when no research text is returned", () => {
    expect(() =>
      extractOpenAIOutputText({
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "Request refused." }],
          },
        ],
      }),
    ).toThrow("Request refused.");
  });
});
