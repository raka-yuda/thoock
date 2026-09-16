import { describe, expect, it } from "vitest";
import {
  maximumAffordableUpscaleCost,
  recommendGenerationStrategy,
  type PipelineOption,
} from "./generation-strategy";

const economical: PipelineOption = {
  providerId: "snapgen",
  modelId: "nano",
  resolution: "1k",
  costPerCandidateUsd: 0.015,
  expectedWidth: 1600,
  expectedHeight: 1200,
};
const direct: PipelineOption = {
  providerId: "snapgen",
  modelId: "gpt-image",
  resolution: "4k",
  costPerCandidateUsd: 0.04,
  expectedWidth: 2368,
  expectedHeight: 1776,
};

describe("generation strategy recommendation", () => {
  it("calculates the selective-upscale break-even point", () => {
    expect(maximumAffordableUpscaleCost(3, 0.04, 0.015)).toBeCloseTo(0.075);
  });

  it("prefers configured local upscaling for a below-4MP economical candidate", () => {
    const result = recommendGenerationStrategy({
      economical,
      direct,
      candidateCount: 3,
      upscaler: {
        id: "local",
        configured: true,
        paid: false,
        estimatedCostPerSelectedUsd: 0,
        maySubstantiallyReinterpret: false,
      },
    });
    expect(result.recommendation).toBe("economical_then_local_upscale");
    expect(result.economicalPipelineCostUsd).toBeCloseTo(0.045);
  });

  it("includes a paid upscale and recommends direct when the complete pipeline is dearer", () => {
    const result = recommendGenerationStrategy({
      economical,
      direct,
      candidateCount: 3,
      upscaler: {
        id: "paid",
        configured: true,
        paid: true,
        estimatedCostPerSelectedUsd: 0.4,
        maySubstantiallyReinterpret: false,
      },
    });
    expect(result.recommendation).toBe("direct_compliant_generation");
    expect(result.economicalPipelineCostUsd).toBeCloseTo(0.445);
    expect(result.directPipelineCostUsd).toBeCloseTo(0.12);
  });

  it("requires a manual choice rather than inventing missing prices", () => {
    const result = recommendGenerationStrategy({
      economical: { ...economical, costPerCandidateUsd: null },
      direct: { ...direct, costPerCandidateUsd: null },
      candidateCount: 3,
      upscaler: null,
    });
    expect(result.recommendation).toBe("manual_decision_required");
    expect(result.estimatedTotalPipelineCostUsd).toBeNull();
  });

  it("prefers native direct output when the upscaler may substantially reinterpret", () => {
    const result = recommendGenerationStrategy({
      economical,
      direct,
      candidateCount: 3,
      upscaler: {
        id: "creative",
        configured: true,
        paid: true,
        estimatedCostPerSelectedUsd: 0.01,
        maySubstantiallyReinterpret: true,
      },
    });
    expect(result.recommendation).toBe("direct_compliant_generation");
  });
});
