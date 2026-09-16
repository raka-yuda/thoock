import { z } from "zod";

export const opportunityInputSchema = z.object({
  keyword: z.string().trim().min(2).max(120),
  targetRegion: z.string().trim().min(2).max(80),
  type: z.enum(["evergreen", "seasonal", "trending"]),
  targetEventDate: z.string().optional(),
  competition: z.coerce.number().int().min(0).max(1_000_000_000),
  trendGrowth: z.coerce.number().min(0).max(100),
  commercialIntent: z.coerce.number().min(0).max(100),
  seasonality: z.coerce.number().min(0).max(100),
  portfolioPerformance: z.coerce.number().min(0).max(100),
});

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export function calculateOpportunityScore(
  input: Pick<
    OpportunityInput,
    | "competition"
    | "trendGrowth"
    | "commercialIntent"
    | "seasonality"
    | "portfolioPerformance"
  >,
) {
  const signals = [
    input.trendGrowth,
    input.commercialIntent,
    input.seasonality,
    input.portfolioPerformance,
  ].map((value) => clamp(value / 100));
  const signalProduct = signals.reduce((product, value) => product * value, 1);
  // Adobe result count is supply, not demand. A logarithmic normalization prevents
  // very large result counts from overwhelming the commercial signals.
  const normalizedCompetition = Math.max(
    0.08,
    Math.log10(input.competition + 10) / 8,
  );
  const raw = signalProduct / normalizedCompetition ** 0.7;
  return Math.round(clamp(raw) * 100);
}

export function explainOpportunityScore(input: OpportunityInput) {
  const score = calculateOpportunityScore(input);
  const strongest = [
    ["trend growth", input.trendGrowth],
    ["commercial intent", input.commercialIntent],
    ["seasonal fit", input.seasonality],
    ["portfolio fit", input.portfolioPerformance],
  ].sort((a, b) => Number(b[1]) - Number(a[1]))[0][0];
  const supply =
    input.competition < 10_000
      ? "low"
      : input.competition < 100_000
        ? "moderate"
        : "high";
  return `${score}/100. Strongest signal: ${strongest}. Estimated Adobe supply is ${supply} at ${input.competition.toLocaleString()} results. Result count is not customer demand.`;
}
