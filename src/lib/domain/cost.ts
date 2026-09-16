export type BudgetInput = {
  spentUsd: number;
  estimateUsd: number;
  monthlyLimitIdr: number;
  usdToIdr: number;
  manualOverride?: boolean;
};

export function estimateGenerationCost(
  unitCostUsd: number,
  candidates: number,
) {
  return Math.round(unitCostUsd * Math.max(1, candidates) * 100) / 100;
}

export function estimateUpscaleCost(
  method: "noop" | "sharp" | "local_ai" | "fast" | "conservative" | "creative",
  configuredPrices: Partial<
    Record<"fast" | "conservative" | "creative", number>
  > = {},
) {
  if (method === "noop" || method === "sharp" || method === "local_ai")
    return 0;
  return configuredPrices[method] ?? null;
}

export function enforceMonthlyBudget(input: BudgetInput) {
  const limitUsd = input.monthlyLimitIdr / input.usdToIdr;
  const projectedUsd = input.spentUsd + input.estimateUsd;
  const ratio = limitUsd === 0 ? 1 : projectedUsd / limitUsd;
  return {
    allowed: input.manualOverride === true || ratio < 1,
    warning: ratio >= 0.8,
    hardStop: ratio >= 1 && input.manualOverride !== true,
    ratio,
    projectedUsd,
    limitUsd,
  };
}

export function isUpscaleDisproportionate(
  generationCost: number,
  upscaleCost: number,
) {
  return generationCost > 0 && upscaleCost > generationCost * 2;
}
