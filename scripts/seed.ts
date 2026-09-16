import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "../src/db";
import {
  applicationSettings,
  assetMetadata,
  assetReviews,
  commercialBriefs,
  generatedAssets,
  generationJobs,
  generationModelCapabilities,
  opportunities,
  prohibitedTerms,
  qualityChecks,
} from "../src/db/schema";
import {
  defaultModelCatalog,
  snapshotModelCapability,
} from "../src/lib/domain/model-catalog";
import {
  calculateOpportunityScore,
  explainOpportunityScore,
  type OpportunityInput,
} from "../src/lib/domain/opportunity";
import { DEFAULT_PROHIBITED_TERMS } from "../src/lib/domain/metadata";
import { BASE_REVIEW_CHECKS } from "../src/lib/domain/review";

async function createDemoImage(prompt: string) {
  const width = 2048;
  const height = 2048;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#315d4d"/>
    <circle cx="1460" cy="650" r="430" fill="rgba(255,255,255,.14)"/>
    <rect x="165" y="245" width="1065" height="1475" rx="72" fill="rgba(255,255,255,.1)"/>
    <text x="165" y="1780" fill="white" font-family="Arial,sans-serif" font-size="72" font-weight="700">DEMO MOCK CANDIDATE</text>
    <text x="165" y="1870" fill="rgba(255,255,255,.8)" font-family="Arial,sans-serif" font-size="34">${prompt.replace(/[<>&'\"]/g, " ").slice(0, 80)}</text>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const image = sharp(buffer, { failOn: "warning" });
  const [metadata, pixels] = await Promise.all([
    image.metadata(),
    image.clone().resize(8, 8, { fit: "fill" }).grayscale().raw().toBuffer(),
  ]);
  if (!metadata.width || !metadata.height || !metadata.format)
    throw new Error("Seed image inspection failed.");
  const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const perceptualHash = [...pixels]
    .map((value) => (value >= average ? "1" : "0"))
    .join("")
    .match(/.{1,4}/g)!
    .map((bits) => Number.parseInt(bits, 2).toString(16))
    .join("");
  return {
    buffer,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    fileSize: buffer.byteLength,
    megapixels: (metadata.width * metadata.height) / 1_000_000,
    checksum: createHash("sha256").update(buffer).digest("hex"),
    perceptualHash,
    hasMetadata: Boolean(metadata.exif || metadata.iptc || metadata.xmp),
  };
}

async function storeDemoImage(key: string, buffer: Buffer) {
  const storageRoot = path.resolve(
    process.env.LOCAL_STORAGE_PATH ?? path.join(process.cwd(), "storage"),
  );
  const target = path.resolve(storageRoot, key);
  if (!target.startsWith(`${storageRoot}${path.sep}`))
    throw new Error("Seed storage key is outside the configured root.");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
}

async function main() {
  const db = getDb();
  const existingSettings = await db.query.applicationSettings.findFirst();
  if (!existingSettings) {
    await db.insert(applicationSettings).values({
      monthlyBudgetIdr: Number(
        process.env.DEFAULT_MONTHLY_BUDGET_IDR ?? 500000,
      ),
      usdToIdr: String(process.env.DEFAULT_USD_TO_IDR ?? 16250),
      mockMode: true,
    });
  }
  await db
    .insert(generationModelCapabilities)
    .values(
      defaultModelCatalog.map((capability) => ({
        providerId: capability.providerId,
        providerModelId: capability.providerModelId,
        displayName: capability.displayName,
        enabled: capability.enabled,
        supportedResolutions: capability.supportedResolutions,
        supportedAspectRatios: capability.supportedAspectRatios,
        supportedQualityLevels: capability.supportedQualityLevels,
        outputFormats: capability.outputFormats,
        supportsNegativePrompt: capability.supportsNegativePrompt,
        supportsSeed: capability.supportsSeed,
        supportsReferenceImages: capability.supportsReferenceImages,
        generationPriceUsd:
          capability.generationPriceUsd === null
            ? null
            : String(capability.generationPriceUsd),
        pricingUnit: capability.pricingUnit,
        creditCost:
          capability.creditCost === null ? null : String(capability.creditCost),
        commercialUseStatus: capability.commercialUseStatus,
        commercialTermsReference: capability.commercialTermsReference,
        lastPricingVerificationDate: capability.lastPricingVerificationDate,
        endpointPath: capability.endpointPath,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(prohibitedTerms)
    .values(
      DEFAULT_PROHIBITED_TERMS.map((term) => ({
        term,
        reason: "Demonstration compliance term",
      })),
    )
    .onConflictDoNothing();
  const existing = await db.query.opportunities.findFirst({
    where: eq(opportunities.keyword, "DEMO: Remote work wellness"),
  });
  if (!existing) {
    const input: OpportunityInput = {
      keyword: "DEMO: Remote work wellness",
      targetRegion: "Southeast Asia",
      type: "evergreen",
      competition: 18420,
      trendGrowth: 78,
      commercialIntent: 86,
      seasonality: 70,
      portfolioPerformance: 62,
    };
    const [opportunity] = await db
      .insert(opportunities)
      .values({
        keyword: input.keyword,
        targetRegion: input.targetRegion,
        type: input.type,
        adobeResultCount: input.competition,
        trendGrowth: String(input.trendGrowth),
        commercialIntent: String(input.commercialIntent),
        seasonality: String(input.seasonality),
        portfolioPerformance: String(input.portfolioPerformance),
        opportunityScore: String(calculateOpportunityScore(input)),
        scoreExplanation: explainOpportunityScore(input),
        status: "briefed",
      })
      .returning();
    const [brief] = await db
      .insert(commercialBriefs)
      .values({
        opportunityId: opportunity.id,
        name: "DEMO: Calm remote-work reset",
        targetBuyer: "HR and workplace wellness teams",
        intendedUsage: "Website hero and employee-wellness campaigns",
        targetMarket: "Southeast Asia",
        mainSubject: "Professional taking a mindful break at a home workspace",
        supportingSubjects: ["laptop", "water glass", "indoor plant"],
        environment: "Contemporary apartment home office",
        visualStyle: "Natural commercial lifestyle photography",
        orientation: "horizontal",
        composition: "Subject on right third with useful copy space",
        copySpaceLocation: "left",
        lighting: "Soft morning window light",
        mood: "Calm and capable",
        representationNotes: "Authentic Southeast Asian professional",
        prohibitedElements: ["logos", "legible text", "branded devices"],
        candidateCount: 1,
        status: "complete",
        generationPrompt:
          "Commercial lifestyle photo of a professional taking a calm break at a contemporary home workspace",
        negativePrompt: "logos, trademarks, legible text, malformed anatomy",
        metadataTitle: "Calm professional at a home workspace",
        metadataCategory: "3",
        metadataLanguage: "en",
        metadataKeywords: [
          "remote",
          "work",
          "home",
          "office",
          "wellness",
          "professional",
          "workspace",
          "productivity",
          "mindful",
          "break",
        ],
        metadataFictionalPeopleProperty: true,
        metadataNotes: "DEMO DATA. Not an actual Adobe submission.",
      })
      .returning();
    const seedCapability = defaultModelCatalog.find(
      (capability) => capability.id === "mock-direct",
    )!;
    const [job] = await db
      .insert(generationJobs)
      .values({
        briefId: brief.id,
        idempotencyKey: `seed-${brief.id}`,
        prompt: brief.generationPrompt,
        negativePrompt: brief.negativePrompt,
        provider: "mock",
        model: seedCapability.providerModelId,
        strategy: "direct_4mp",
        resolution: "direct-4mp",
        quality: "standard",
        aspectRatio: "1:1",
        modelCapabilitySnapshot: snapshotModelCapability(seedCapability),
        requestedWidth: 2048,
        requestedHeight: 2048,
        candidateCount: 1,
        estimatedCostUsd: "0",
        actualCostUsd: "0",
        status: "succeeded",
        progress: 100,
        providerRequestId: "demo-seed",
      })
      .returning();
    const image = await createDemoImage(brief.generationPrompt);
    const key = `generated/${job.id}/candidate-1.jpg`;
    await storeDemoImage(key, image.buffer);
    const [asset] = await db
      .insert(generatedAssets)
      .values({
        generationJobId: job.id,
        storageKey: key,
        originalFilename: "demo-candidate-1.jpg",
        mimeType: "image/jpeg",
        providerReportedWidth: image.width,
        providerReportedHeight: image.height,
        width: image.width,
        height: image.height,
        megapixels: String(image.megapixels),
        fileSize: image.fileSize,
        checksum: image.checksum,
        perceptualHash: image.perceptualHash,
        hasMetadata: image.hasMetadata,
        upscaleStatus: "upscale_not_required",
      })
      .returning();
    const [review] = await db
      .insert(assetReviews)
      .values({
        generatedAssetId: asset.id,
        stage: "candidate",
        decision: "approved",
        notes: "DEMO: Human review complete",
        reviewedAt: new Date(),
      })
      .returning();
    await db
      .insert(qualityChecks)
      .values(
        BASE_REVIEW_CHECKS.map((label, index) => ({
          assetReviewId: review.id,
          checkKey: `base_${index + 1}`,
          label,
          passed: true,
        })),
      );
    await db
      .insert(assetMetadata)
      .values({
        generatedAssetId: asset.id,
        filename: "demo-remote-workspace.jpg",
        title: "Calm professional at a home workspace",
        category: "3",
        language: "en",
        keywords: [
          "remote work",
          "home office",
          "wellness",
          "professional",
          "workspace",
          "productivity",
          "mindful break",
          "copy space",
        ],
        generativeAi: true,
        fictionalPeopleProperty: true,
        internalNotes: "DEMO DATA. Not an actual Adobe submission.",
      });
  }
  console.info(
    "Demonstration data seeded. All demo records are clearly prefixed or noted.",
  );
}

if (process.env.SEED_VALIDATE_ONLY !== "true") {
  main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "Database seed failed.",
      );
      process.exit(1);
    });
}
