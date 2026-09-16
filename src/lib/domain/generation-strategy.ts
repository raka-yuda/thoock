import { calculateMegapixels } from "./image";

export type StrategyRecommendation =
  | "economical_generation"
  | "economical_then_local_upscale"
  | "economical_then_paid_upscale"
  | "direct_compliant_generation"
  | "manual_decision_required";

export type PipelineOption = {
  providerId: string;
  modelId: string;
  resolution: string;
  costPerCandidateUsd: number | null;
  expectedWidth: number | null;
  expectedHeight: number | null;
};

export type RecommendationInput = {
  economical: PipelineOption;
  direct: PipelineOption | null;
  candidateCount: number;
  expectedSelectedCount?: number;
  upscaler: {
    id: string;
    configured: boolean;
    paid: boolean;
    estimatedCostPerSelectedUsd: number | null;
    maySubstantiallyReinterpret: boolean;
  } | null;
  minimumMegapixels?: number;
};

export type StrategyEstimate = {
  recommendation: StrategyRecommendation;
  estimatedCandidateGenerationCostUsd: number | null;
  estimatedUpscalingCostUsd: number | null;
  estimatedTotalPipelineCostUsd: number | null;
  economicalPipelineCostUsd: number | null;
  directPipelineCostUsd: number | null;
  maximumAffordableUpscaleCostUsd: number | null;
  expectedDirectCompliance: boolean | null;
  expectedUpscaleRequired: boolean | null;
  explanation: string;
  warnings: string[];
  alternativeStrategies: StrategyRecommendation[];
};

export function maximumAffordableUpscaleCost(
  candidateCount: number,
  directCostPerCandidate: number | null,
  economicalCostPerCandidate: number | null,
) {
  if (directCostPerCandidate === null || economicalCostPerCandidate === null)
    return null;
  return candidateCount * (directCostPerCandidate - economicalCostPerCandidate);
}

function multiply(value: number | null, multiplier: number) {
  return value === null ? null : value * multiplier;
}

function add(left: number | null, right: number | null) {
  return left === null || right === null ? null : left + right;
}

function expectedCompliance(
  option: PipelineOption | null,
  minimumMegapixels: number,
) {
  if (
    !option ||
    option.expectedWidth === null ||
    option.expectedHeight === null
  )
    return null;
  return (
    calculateMegapixels(option.expectedWidth, option.expectedHeight) >=
    minimumMegapixels
  );
}

export function recommendGenerationStrategy(
  input: RecommendationInput,
): StrategyEstimate {
  const minimumMegapixels = input.minimumMegapixels ?? 4;
  const selectedCount = input.expectedSelectedCount ?? 1;
  const economicalGeneration = multiply(
    input.economical.costPerCandidateUsd,
    input.candidateCount,
  );
  const directGeneration = input.direct
    ? multiply(input.direct.costPerCandidateUsd, input.candidateCount)
    : null;
  const economicalCompliant = expectedCompliance(
    input.economical,
    minimumMegapixels,
  );
  const directCompliant = expectedCompliance(input.direct, minimumMegapixels);
  const upscalePerSelected =
    economicalCompliant === true
      ? 0
      : (input.upscaler?.estimatedCostPerSelectedUsd ?? null);
  const upscalingCost = multiply(upscalePerSelected, selectedCount);
  const economicalTotal = add(economicalGeneration, upscalingCost);
  const warnings: string[] = [
    "Resolution labels are estimates; locally inspected file dimensions are authoritative.",
  ];
  if (
    economicalGeneration === null ||
    (economicalCompliant !== true && upscalingCost === null)
  )
    warnings.push("Complete economical-pipeline pricing is unavailable.");
  if (directGeneration === null)
    warnings.push("Direct-compliant generation pricing is unavailable.");
  if (directCompliant === false)
    warnings.push(
      "The configured direct option is not expected to reach the current megapixel minimum.",
    );

  let recommendation: StrategyRecommendation;
  let explanation: string;
  if (economicalCompliant === true) {
    recommendation = "economical_generation";
    explanation =
      "The economical option is expected to meet 4MP, so no upscale is included. Inspect every returned file before relying on that expectation.";
  } else if (input.upscaler?.configured && !input.upscaler.paid) {
    recommendation = "economical_then_local_upscale";
    explanation =
      "Generate economical candidates, select one after human review, then use the configured no-charge local AI upscaler only if its inspected file is below 4MP.";
  } else if (
    input.upscaler?.maySubstantiallyReinterpret &&
    directCompliant === true
  ) {
    recommendation = "direct_compliant_generation";
    explanation =
      "Direct-compliant generation avoids an upscaler configured as likely to substantially reinterpret source detail.";
  } else if (
    economicalTotal !== null &&
    directGeneration !== null &&
    directCompliant === true
  ) {
    if (directGeneration <= economicalTotal) {
      recommendation = "direct_compliant_generation";
      explanation =
        "Direct-compliant generation costs no more than economical generation plus selective upscaling.";
    } else {
      recommendation = "economical_then_paid_upscale";
      explanation =
        "Economical generation plus one expected paid upscale is cheaper. The upscale still requires explicit confirmation after candidate selection.";
    }
  } else {
    recommendation = "manual_decision_required";
    explanation =
      "Missing price, dimension, or upscaler configuration prevents a reliable full-pipeline comparison.";
  }

  const alternatives: StrategyRecommendation[] = [
    "economical_then_local_upscale",
    "economical_then_paid_upscale",
    "direct_compliant_generation",
    "manual_decision_required",
  ].filter(
    (candidate) => candidate !== recommendation,
  ) as StrategyRecommendation[];
  return {
    recommendation,
    estimatedCandidateGenerationCostUsd:
      recommendation === "direct_compliant_generation"
        ? directGeneration
        : economicalGeneration,
    estimatedUpscalingCostUsd:
      recommendation === "direct_compliant_generation" ? 0 : upscalingCost,
    estimatedTotalPipelineCostUsd:
      recommendation === "direct_compliant_generation"
        ? directGeneration
        : economicalTotal,
    economicalPipelineCostUsd: economicalTotal,
    directPipelineCostUsd: directGeneration,
    maximumAffordableUpscaleCostUsd: maximumAffordableUpscaleCost(
      input.candidateCount,
      input.direct?.costPerCandidateUsd ?? null,
      input.economical.costPerCandidateUsd,
    ),
    expectedDirectCompliance: directCompliant,
    expectedUpscaleRequired:
      economicalCompliant === null ? null : !economicalCompliant,
    explanation,
    warnings,
    alternativeStrategies: alternatives,
  };
}
