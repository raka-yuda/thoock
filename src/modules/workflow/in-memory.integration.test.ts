import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { MockImageGenerationProvider } from "@/modules/providers/generation";
import { MockUpscaleProvider } from "@/modules/providers/upscale";
import { DeterministicMetadataProvider } from "@/modules/providers/metadata";
import { InMemoryWorkflow } from "./in-memory";

describe("creative production workflow", () => {
  it("covers opportunity through a submission-ready export package", async () => {
    const workflow = new InMemoryWorkflow(
      new MockImageGenerationProvider(),
      new MockUpscaleProvider(),
      new DeterministicMetadataProvider(),
    );
    const opportunity = workflow.createOpportunity({
      keyword: "remote work wellness",
      targetRegion: "Indonesia",
      type: "evergreen",
      competition: 18000,
      trendGrowth: 78,
      commercialIntent: 86,
      seasonality: 70,
      portfolioPerformance: 62,
    });
    expect(opportunity.score).toBeGreaterThan(0);
    const brief = workflow.convertToBrief(opportunity.id);
    const { job, asset } = await workflow.generate(brief.id, 1600, 1200);
    expect(job.status).toBe("succeeded");
    expect(asset.megapixels).toBeCloseTo(1.92);
    workflow.reviewAsset(asset.id, "approved");
    const upscaled = await workflow.upscale(asset.id);
    expect(upscaled.megapixels).toBeGreaterThanOrEqual(4);
    expect(workflow.reviewUpscaled(upscaled.id).status).toBe(
      "approved_after_upscale",
    );
    const metadata = await workflow.prepareMetadata(asset.id, brief.id);
    expect(metadata.validation.valid).toBe(true);
    const batch = await workflow.export(asset.id, upscaled.id);
    const files = await JSZip.loadAsync(batch.archive.buffer as Buffer);
    expect(Object.keys(files.files)).toEqual(
      expect.arrayContaining([
        "adobe-stock.csv",
        "manifest.json",
        "compliance-report.json",
      ]),
    );
  });

  it("does not allow upscaling a candidate that is unreviewed or already at least 4MP", async () => {
    const workflow = new InMemoryWorkflow(
      new MockImageGenerationProvider(),
      new MockUpscaleProvider(),
      new DeterministicMetadataProvider(),
    );
    const opportunity = workflow.createOpportunity({
      keyword: "secure finance",
      targetRegion: "Global",
      type: "evergreen",
      competition: 50000,
      trendGrowth: 60,
      commercialIntent: 90,
      seasonality: 55,
      portfolioPerformance: 50,
    });
    const brief = workflow.convertToBrief(opportunity.id);
    const low = await workflow.generate(brief.id, 1600, 1200);
    await expect(workflow.upscale(low.asset.id)).rejects.toThrow(
      "Only approved",
    );
    const high = await workflow.generate(brief.id, 2048, 2048);
    workflow.reviewAsset(high.asset.id, "approved");
    await expect(workflow.upscale(high.asset.id)).rejects.toThrow(
      "not required",
    );
  });
});
