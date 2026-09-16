import { randomUUID } from "node:crypto";
import {
  calculateOpportunityScore,
  explainOpportunityScore,
  opportunityInputSchema,
  type OpportunityInput,
} from "@/lib/domain/opportunity";
import { decideUpscale } from "@/lib/domain/image";
import { inspectImage } from "@/modules/assets/inspect";
import {
  validateAdobeMetadata,
  type AssetMetadata,
} from "@/lib/domain/metadata";
import {
  BASE_REVIEW_CHECKS,
  POST_UPSCALE_CHECKS,
  isSubmissionReady,
} from "@/lib/domain/review";
import type {
  ImageGenerationProvider,
  ImageUpscaleProvider,
  MetadataGenerationProvider,
} from "@/modules/providers/contracts";
import { createExportArchive } from "@/modules/exports/create-batch";
import { prepareAdobeJpeg } from "@/modules/assets/prepare";

type RecordMap = Map<string, Record<string, unknown>>;
export class InMemoryWorkflow {
  opportunities: RecordMap = new Map();
  briefs: RecordMap = new Map();
  jobs: RecordMap = new Map();
  assets: RecordMap = new Map();
  derivedAssets: RecordMap = new Map();
  metadata: RecordMap = new Map();
  batches: RecordMap = new Map();
  constructor(
    private generationProvider: ImageGenerationProvider,
    private upscaleProvider: ImageUpscaleProvider,
    private metadataProvider: MetadataGenerationProvider,
  ) {}

  createOpportunity(input: OpportunityInput) {
    const valid = opportunityInputSchema.parse(input);
    const id = randomUUID();
    const record = {
      id,
      ...valid,
      score: calculateOpportunityScore(valid),
      explanation: explainOpportunityScore(valid),
    };
    this.opportunities.set(id, record);
    return record;
  }
  convertToBrief(opportunityId: string) {
    const opportunity = this.opportunities.get(opportunityId);
    if (!opportunity) throw new Error("Opportunity not found.");
    const id = randomUUID();
    const brief = {
      id,
      opportunityId,
      name: `${opportunity.keyword} commercial brief`,
      prompt: `Commercial stock image for ${opportunity.keyword} in ${opportunity.targetRegion}`,
      negativePrompt: "logos, trademarks, legible text",
      status: "ready",
    };
    this.briefs.set(id, brief);
    return brief;
  }
  async generate(briefId: string, width = 1600, height = 1200) {
    const brief = this.briefs.get(briefId);
    if (!brief) throw new Error("Brief not found.");
    const id = randomUUID();
    const images = await this.generationProvider.generate({
      prompt: String(brief.prompt),
      negativePrompt: String(brief.negativePrompt),
      model: "mock-v1",
      requestedWidth: width,
      requestedHeight: height,
      aspectRatio: "4:3",
      resolution: "economical",
      candidates: 1,
    });
    const inspection = await inspectImage(images[0].buffer);
    const assetId = randomUUID();
    const asset = {
      id: assetId,
      jobId: id,
      buffer: images[0].buffer,
      providerReportedWidth: images[0].providerReportedWidth,
      providerReportedHeight: images[0].providerReportedHeight,
      ...inspection,
      decision: "pending",
      upscale: decideUpscale(inspection.width, inspection.height),
      checks: [] as boolean[],
    };
    this.jobs.set(id, { id, briefId, status: "succeeded" });
    this.assets.set(assetId, asset);
    return { job: this.jobs.get(id)!, asset };
  }
  reviewAsset(
    assetId: string,
    decision: "approved" | "rejected",
    checks = BASE_REVIEW_CHECKS.map(() => true),
  ) {
    const asset = this.assets.get(assetId);
    if (!asset) throw new Error("Asset not found.");
    asset.decision = decision;
    asset.checks = checks;
    return asset;
  }
  async upscale(assetId: string) {
    const asset = this.assets.get(assetId);
    if (!asset) throw new Error("Asset not found.");
    if (asset.decision !== "approved")
      throw new Error("Only approved candidates can be upscaled.");
    const decision = asset.upscale as ReturnType<typeof decideUpscale>;
    if (!decision.required)
      throw new Error(
        "Upscale is not required for assets already at least 4MP.",
      );
    const result = await this.upscaleProvider.upscale({
      input: asset.buffer as Buffer,
      mimeType: "image/jpeg",
      width: Number(asset.width),
      height: Number(asset.height),
      targetWidth: decision.target.width,
      targetHeight: decision.target.height,
      method: "fast",
    });
    const buffer =
      result.buffer ?? (await this.upscaleProvider.downloadResult(result.id));
    const inspection = await inspectImage(buffer);
    const id = randomUUID();
    const derived = {
      id,
      sourceAssetId: assetId,
      buffer,
      ...inspection,
      status: "awaiting_final_review",
      checks: [] as boolean[],
    };
    this.derivedAssets.set(id, derived);
    return derived;
  }
  reviewUpscaled(
    derivedId: string,
    checks = POST_UPSCALE_CHECKS.map(() => true),
  ) {
    const asset = this.derivedAssets.get(derivedId);
    if (!asset) throw new Error("Derived asset not found.");
    asset.checks = checks;
    asset.status = checks.every(Boolean)
      ? "approved_after_upscale"
      : "awaiting_final_review";
    return asset;
  }
  async prepareMetadata(assetId: string, briefId: string) {
    const asset = this.assets.get(assetId);
    const brief = this.briefs.get(briefId);
    if (!asset || !brief) throw new Error("Asset or brief not found.");
    const value = await this.metadataProvider.generate({
      briefName: String(brief.name),
      prompt: String(brief.prompt),
      filenameHint: String(brief.name),
    });
    const validation = validateAdobeMetadata(value);
    this.metadata.set(assetId, { assetId, value, validation });
    return { value, validation };
  }
  async export(assetId: string, derivedId?: string) {
    const asset = this.assets.get(assetId);
    const metadata = this.metadata.get(assetId)?.value as
      AssetMetadata | undefined;
    if (!asset || !metadata)
      throw new Error("Asset and metadata are required.");
    const derived = derivedId ? this.derivedAssets.get(derivedId) : undefined;
    const selected = derived ?? asset;
    const prepared = await prepareAdobeJpeg(
      selected.buffer as Buffer,
      metadata.filename,
    );
    const ready = isSubmissionReady({
      baseChecks: asset.checks as boolean[],
      metadataValid: validateAdobeMetadata(metadata).valid,
      megapixels: prepared.prepared.megapixels,
      postUpscaleRequired: Boolean(derived),
      postUpscaleChecks: derived?.checks as boolean[] | undefined,
    });
    if (!ready) throw new Error("Asset is not submission ready.");
    const archive = await createExportArchive("Integration batch", [
      {
        metadata: { ...metadata, filename: prepared.filename },
        jpeg: prepared.buffer,
        checksum: prepared.prepared.checksum,
        sourceAssetId: assetId,
        preparedAssetId: derivedId ?? assetId,
        upscaled: Boolean(derivedId),
        reviewCompleted: true,
      },
    ]);
    const id = randomUUID();
    const batch = { id, itemCount: 1, archive };
    this.batches.set(id, batch);
    return batch;
  }
}
