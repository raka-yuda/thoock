import "server-only";
import type { StockResearchProvider } from "./contracts";

export class MockStockResearchProvider implements StockResearchProvider {
  readonly id = "mock-adobe";
  readonly label = "Mock Adobe research";

  async search(keyword: string, region: string) {
    let hash = 0;
    for (const character of `${keyword}:${region}`)
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return {
      resultCount: 8_000 + (hash % 240_000),
      competitionEstimate: true,
      relatedKeywords: [
        `${keyword} copy space`,
        `${keyword} lifestyle`,
        `${region} ${keyword}`,
      ],
      source: "Deterministic demonstration data",
    };
  }
}

export class AdobeStockResearchProvider implements StockResearchProvider {
  readonly id = "adobe-stock";
  readonly label = "Adobe Stock configured endpoint";

  async search(keyword: string, region: string) {
    const endpoint = process.env.ADOBE_STOCK_API_URL;
    const apiKey = process.env.ADOBE_STOCK_API_KEY;
    if (!endpoint || !apiKey)
      throw new Error("Adobe Stock research provider is not configured.");
    const url = new URL(endpoint);
    url.searchParams.set("words", keyword);
    url.searchParams.set("locale", region);
    const response = await fetch(url, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        `Adobe research request failed with status ${response.status}.`,
      );
    const data = (await response.json()) as {
      nb_results?: number;
      result_count?: number;
    };
    return {
      resultCount: data.nb_results ?? data.result_count ?? 0,
      competitionEstimate: true,
      relatedKeywords: [],
      source: "Configured Adobe Stock search endpoint",
    };
  }
}
