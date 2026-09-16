import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const opportunityType = pgEnum("opportunity_type", [
  "evergreen",
  "seasonal",
  "trending",
]);
export const opportunityStatus = pgEnum("opportunity_status", [
  "researching",
  "shortlisted",
  "briefed",
  "archived",
]);
export const briefStatus = pgEnum("brief_status", [
  "draft",
  "ready",
  "generating",
  "complete",
  "archived",
]);
export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export const providerRequestLogStatus = pgEnum("provider_request_log_status", [
  "started",
  "succeeded",
  "failed",
]);
export const generationStrategy = pgEnum("generation_strategy", [
  "economical",
  "direct_4mp",
  "custom",
]);
export const reviewDecision = pgEnum("review_decision", [
  "pending",
  "approved",
  "rejected",
  "regenerate",
]);
export const derivedAssetType = pgEnum("derived_asset_type", [
  "logo_removed",
  "sharp_resize",
  "ai_upscale",
  "prepared_jpeg",
]);
export const upscaleStatus = pgEnum("upscale_status", [
  "not_inspected",
  "upscale_not_required",
  "upscale_required",
  "waiting_for_confirmation",
  "upscaling",
  "upscaled",
  "upscale_failed",
  "awaiting_final_review",
  "approved_after_upscale",
]);
export const submissionStatus = pgEnum("submission_status", [
  "draft",
  "ready",
  "submitted",
  "under_review",
  "accepted",
  "rejected",
  "published",
  "removed",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyword: varchar("keyword", { length: 120 }).notNull(),
    targetRegion: varchar("target_region", { length: 80 }).notNull(),
    type: opportunityType("type").notNull(),
    targetEventDate: date("target_event_date"),
    adobeResultCount: integer("adobe_result_count").notNull().default(0),
    trendGrowth: numeric("trend_growth", { precision: 6, scale: 2 }).notNull(),
    commercialIntent: numeric("commercial_intent", {
      precision: 6,
      scale: 2,
    }).notNull(),
    seasonality: numeric("seasonality", { precision: 6, scale: 2 }).notNull(),
    portfolioPerformance: numeric("portfolio_performance", {
      precision: 6,
      scale: 2,
    }).notNull(),
    opportunityScore: numeric("opportunity_score", {
      precision: 6,
      scale: 2,
    }).notNull(),
    scoreExplanation: text("score_explanation").notNull(),
    status: opportunityStatus("status").notNull().default("researching"),
    ...timestamps,
  },
  (table) => [
    index("opportunities_score_idx").on(table.opportunityScore),
    index("opportunities_status_idx").on(table.status),
    index("opportunities_keyword_idx").on(table.keyword),
  ],
);

export const opportunitySignals = pgTable(
  "opportunity_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 60 }).notNull(),
    signalType: varchar("signal_type", { length: 60 }).notNull(),
    value: numeric("value", { precision: 14, scale: 4 }).notNull(),
    isEstimate: boolean("is_estimate").notNull().default(true),
    rawPayload: jsonb("raw_payload"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("opportunity_signals_opportunity_idx").on(table.opportunityId),
  ],
);

export const commercialBriefs = pgTable(
  "commercial_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 160 }).notNull(),
    targetBuyer: text("target_buyer").notNull(),
    intendedUsage: text("intended_usage").notNull(),
    targetMarket: varchar("target_market", { length: 100 }).notNull(),
    mainSubject: text("main_subject").notNull(),
    supportingSubjects: text("supporting_subjects")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    environment: text("environment").notNull(),
    visualStyle: text("visual_style").notNull(),
    orientation: varchar("orientation", { length: 24 }).notNull(),
    composition: text("composition").notNull(),
    copySpaceLocation: varchar("copy_space_location", { length: 40 }).notNull(),
    lighting: text("lighting").notNull(),
    mood: text("mood").notNull(),
    representationNotes: text("representation_notes").notNull().default(""),
    prohibitedElements: text("prohibited_elements")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    candidateCount: integer("candidate_count").notNull().default(4),
    status: briefStatus("status").notNull().default("draft"),
    generationPrompt: text("generation_prompt").notNull(),
    negativePrompt: text("negative_prompt").notNull().default(""),
    metadataTitle: varchar("metadata_title", { length: 70 }).notNull().default(""),
    metadataCategory: varchar("metadata_category", { length: 2 })
      .notNull()
      .default(""),
    metadataLanguage: varchar("metadata_language", { length: 10 })
      .notNull()
      .default("en"),
    metadataKeywords: text("metadata_keywords")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    metadataFictionalPeopleProperty: boolean(
      "metadata_fictional_people_property",
    )
      .notNull()
      .default(false),
    metadataNotes: text("metadata_notes").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    index("commercial_briefs_opportunity_idx").on(table.opportunityId),
    index("commercial_briefs_status_idx").on(table.status),
  ],
);

export const generationModelCapabilities = pgTable(
  "generation_model_capabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: varchar("provider_id", { length: 60 }).notNull(),
    providerModelId: varchar("provider_model_id", { length: 160 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    supportedResolutions: jsonb("supported_resolutions")
      .notNull()
      .default(sql`'[]'::jsonb`),
    supportedAspectRatios: text("supported_aspect_ratios")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    supportedQualityLevels: text("supported_quality_levels")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    outputFormats: text("output_formats")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    supportsNegativePrompt: boolean("supports_negative_prompt")
      .notNull()
      .default(false),
    supportsSeed: boolean("supports_seed").notNull().default(false),
    supportsReferenceImages: boolean("supports_reference_images")
      .notNull()
      .default(false),
    generationPriceUsd: numeric("generation_price_usd", {
      precision: 12,
      scale: 6,
    }),
    pricingUnit: varchar("pricing_unit", { length: 30 })
      .notNull()
      .default("unknown"),
    creditCost: numeric("credit_cost", { precision: 12, scale: 4 }),
    commercialUseStatus: varchar("commercial_use_status", { length: 30 })
      .notNull()
      .default("unverified"),
    commercialTermsReference: text("commercial_terms_reference"),
    lastPricingVerificationDate: date("last_pricing_verification_date"),
    endpointPath: text("endpoint_path"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("generation_model_capability_provider_model_idx").on(
      table.providerId,
      table.providerModelId,
    ),
    index("generation_model_capability_enabled_idx").on(
      table.enabled,
      table.providerId,
    ),
  ],
);

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    retryOfJobId: uuid("retry_of_job_id").references(
      (): AnyPgColumn => generationJobs.id,
      { onDelete: "set null" },
    ),
    regenerateOfJobId: uuid("regenerate_of_job_id").references(
      (): AnyPgColumn => generationJobs.id,
      { onDelete: "set null" },
    ),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => commercialBriefs.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
    prompt: text("prompt").notNull(),
    negativePrompt: text("negative_prompt").notNull().default(""),
    provider: varchar("provider", { length: 60 }).notNull(),
    model: varchar("model", { length: 160 }).notNull(),
    strategy: generationStrategy("strategy").notNull().default("economical"),
    resolution: varchar("resolution", { length: 80 })
      .notNull()
      .default("unspecified"),
    quality: varchar("quality", { length: 80 }),
    aspectRatio: varchar("aspect_ratio", { length: 20 })
      .notNull()
      .default("1:1"),
    seed: integer("seed"),
    modelCapabilitySnapshot: jsonb("model_capability_snapshot")
      .notNull()
      .default(sql`'{}'::jsonb`),
    strategyEstimateSnapshot: jsonb("strategy_estimate_snapshot")
      .notNull()
      .default(sql`'{}'::jsonb`),
    expectedSelectedCount: integer("expected_selected_count")
      .notNull()
      .default(1),
    requestedWidth: integer("requested_width").notNull(),
    requestedHeight: integer("requested_height").notNull(),
    candidateCount: integer("candidate_count").notNull(),
    providerRequestId: varchar("provider_request_id", { length: 200 }),
    providerRequestIds: text("provider_request_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 4 })
      .notNull()
      .default("0"),
    estimatedUpscaleCostUsd: numeric("estimated_upscale_cost_usd", {
      precision: 12,
      scale: 4,
    }),
    estimatedPipelineCostUsd: numeric("estimated_pipeline_cost_usd", {
      precision: 12,
      scale: 4,
    }),
    actualCostUsd: numeric("actual_cost_usd", { precision: 12, scale: 4 }),
    status: jobStatus("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    errorDetails: text("error_details"),
    failureKind: varchar("failure_kind", { length: 40 }),
    attemptCount: integer("attempt_count").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("generation_jobs_idempotency_idx").on(table.idempotencyKey),
    index("generation_jobs_status_idx").on(table.status, table.createdAt),
    index("generation_jobs_brief_idx").on(table.briefId),
    index("generation_jobs_retry_idx").on(table.retryOfJobId),
    index("generation_jobs_regenerate_idx").on(table.regenerateOfJobId),
  ],
);

export const providerRequestLogs = pgTable(
  "provider_request_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationJobId: uuid("generation_job_id").references(
      () => generationJobs.id,
      { onDelete: "set null" },
    ),
    sourcePath: varchar("source_path", { length: 160 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
    provider: varchar("provider", { length: 60 }).notNull(),
    model: varchar("model", { length: 160 }).notNull(),
    operation: varchar("operation", { length: 60 })
      .notNull()
      .default("image_generation"),
    status: providerRequestLogStatus("status").notNull().default("started"),
    requestBody: jsonb("request_body").notNull(),
    providerRequestBody: jsonb("provider_request_body").notNull(),
    responseBody: jsonb("response_body"),
    providerRequestIds: text("provider_request_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 12,
      scale: 6,
    }),
    actualCostUsd: numeric("actual_cost_usd", { precision: 12, scale: 6 }),
    durationMs: integer("duration_ms"),
    errorDetails: text("error_details"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("provider_request_logs_created_idx").on(table.createdAt),
    index("provider_request_logs_status_idx").on(table.status, table.createdAt),
    index("provider_request_logs_provider_idx").on(
      table.provider,
      table.createdAt,
    ),
    index("provider_request_logs_job_idx").on(table.generationJobId),
    index("provider_request_logs_idempotency_idx").on(table.idempotencyKey),
  ],
);

export const generatedAssets = pgTable(
  "generated_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationJobId: uuid("generation_job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    providerRequestId: varchar("provider_request_id", { length: 200 }),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    providerReportedWidth: integer("provider_reported_width"),
    providerReportedHeight: integer("provider_reported_height"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    megapixels: numeric("megapixels", { precision: 10, scale: 4 }).notNull(),
    fileSize: integer("file_size").notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    perceptualHash: varchar("perceptual_hash", { length: 64 }).notNull(),
    hasMetadata: boolean("has_metadata").notNull().default(false),
    logoRemovalStatus: varchar("logo_removal_status", { length: 30 })
      .notNull()
      .default("not_required"),
    logoRemovalError: text("logo_removal_error"),
    upscaleStatus: upscaleStatus("upscale_status")
      .notNull()
      .default("not_inspected"),
    ...timestamps,
  },
  (table) => [
    index("generated_assets_job_idx").on(table.generationJobId),
    index("generated_assets_created_idx").on(table.createdAt, table.id),
    index("generated_assets_phash_idx").on(table.perceptualHash),
    index("generated_assets_upscale_idx").on(table.upscaleStatus),
  ],
);

export const derivedAssets = pgTable(
  "derived_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceAssetId: uuid("source_asset_id")
      .notNull()
      .references(() => generatedAssets.id, { onDelete: "restrict" }),
    sourceDerivedAssetId: uuid("source_derived_asset_id").references(
      (): AnyPgColumn => derivedAssets.id,
      { onDelete: "set null" },
    ),
    type: derivedAssetType("type").notNull(),
    provider: varchar("provider", { length: 60 }).notNull(),
    method: varchar("method", { length: 60 }).notNull(),
    storageKey: text("storage_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    megapixels: numeric("megapixels", { precision: 10, scale: 4 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: integer("file_size").notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    perceptualHash: varchar("perceptual_hash", { length: 64 }).notNull(),
    mayReinterpretDetail: boolean("may_reinterpret_detail")
      .notNull()
      .default(false),
    ...timestamps,
  },
  (table) => [
    index("derived_assets_source_idx").on(table.sourceAssetId),
    index("derived_assets_phash_idx").on(table.perceptualHash),
  ],
);

export const assetReviews = pgTable(
  "asset_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generatedAssetId: uuid("generated_asset_id").references(
      () => generatedAssets.id,
      { onDelete: "cascade" },
    ),
    derivedAssetId: uuid("derived_asset_id").references(
      () => derivedAssets.id,
      { onDelete: "cascade" },
    ),
    stage: varchar("stage", { length: 30 }).notNull().default("candidate"),
    decision: reviewDecision("decision").notNull().default("pending"),
    notes: text("notes").notNull().default(""),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("asset_reviews_generated_idx").on(
      table.generatedAssetId,
      table.createdAt,
    ),
    index("asset_reviews_derived_idx").on(table.derivedAssetId),
  ],
);

export const qualityChecks = pgTable(
  "quality_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetReviewId: uuid("asset_review_id")
      .notNull()
      .references(() => assetReviews.id, { onDelete: "cascade" }),
    checkKey: varchar("check_key", { length: 100 }).notNull(),
    label: text("label").notNull(),
    passed: boolean("passed").notNull().default(false),
    advisory: boolean("advisory").notNull().default(false),
    details: text("details"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("quality_checks_review_key_idx").on(
      table.assetReviewId,
      table.checkKey,
    ),
  ],
);

export const assetMetadata = pgTable(
  "asset_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generatedAssetId: uuid("generated_asset_id")
      .notNull()
      .references(() => generatedAssets.id, { onDelete: "cascade" }),
    preparedAssetId: uuid("prepared_asset_id").references(
      () => derivedAssets.id,
      { onDelete: "set null" },
    ),
    filename: varchar("filename", { length: 30 }).notNull(),
    title: varchar("title", { length: 70 }).notNull(),
    category: varchar("category", { length: 80 }).notNull(),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    keywords: text("keywords").array().notNull(),
    generativeAi: boolean("generative_ai").notNull().default(true),
    fictionalPeopleProperty: boolean("fictional_people_property")
      .notNull()
      .default(false),
    internalNotes: text("internal_notes").notNull().default(""),
    validationErrors: jsonb("validation_errors")
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("asset_metadata_generated_idx").on(table.generatedAssetId),
    uniqueIndex("asset_metadata_filename_idx").on(table.filename),
  ],
);

export const upscaleJobs = pgTable(
  "upscale_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceAssetId: uuid("source_asset_id")
      .notNull()
      .references(() => generatedAssets.id, { onDelete: "restrict" }),
    derivedAssetId: uuid("derived_asset_id").references(
      () => derivedAssets.id,
      { onDelete: "set null" },
    ),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
    provider: varchar("provider", { length: 60 }).notNull(),
    method: varchar("method", { length: 60 }).notNull(),
    targetWidth: integer("target_width").notNull(),
    targetHeight: integer("target_height").notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 4 })
      .notNull()
      .default("0"),
    actualCostUsd: numeric("actual_cost_usd", { precision: 12, scale: 4 }),
    providerRequestId: text("provider_request_id"),
    status: upscaleStatus("status")
      .notNull()
      .default("waiting_for_confirmation"),
    errorDetails: text("error_details"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("upscale_jobs_idempotency_idx").on(table.idempotencyKey),
    index("upscale_jobs_status_idx").on(table.status, table.createdAt),
  ],
);

export const exportBatches = pgTable("export_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 140 }).notNull(),
  status: jobStatus("status").notNull().default("queued"),
  storageKey: text("storage_key"),
  itemCount: integer("item_count").notNull().default(0),
  csvBytes: integer("csv_bytes"),
  manifest: jsonb("manifest"),
  complianceReport: jsonb("compliance_report"),
  errorDetails: text("error_details"),
  ...timestamps,
});

export const exportBatchItems = pgTable(
  "export_batch_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exportBatchId: uuid("export_batch_id")
      .notNull()
      .references(() => exportBatches.id, { onDelete: "cascade" }),
    generatedAssetId: uuid("generated_asset_id")
      .notNull()
      .references(() => generatedAssets.id, { onDelete: "restrict" }),
    preparedAssetId: uuid("prepared_asset_id")
      .notNull()
      .references(() => derivedAssets.id, { onDelete: "restrict" }),
    filename: varchar("filename", { length: 30 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("export_batch_items_unique_idx").on(
      table.exportBatchId,
      table.generatedAssetId,
    ),
  ],
);

export const adobeSubmissions = pgTable(
  "adobe_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generatedAssetId: uuid("generated_asset_id")
      .notNull()
      .references(() => generatedAssets.id, { onDelete: "restrict" }),
    exportBatchId: uuid("export_batch_id").references(() => exportBatches.id, {
      onDelete: "set null",
    }),
    submissionDate: date("submission_date"),
    adobeAssetId: varchar("adobe_asset_id", { length: 120 }),
    status: submissionStatus("status").notNull().default("draft"),
    acceptedDate: date("accepted_date"),
    rejectedDate: date("rejected_date"),
    rejectionReason: text("rejection_reason"),
    publicationDate: date("publication_date"),
    downloads: integer("downloads").notNull().default(0),
    totalRoyaltiesUsd: numeric("total_royalties_usd", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    notes: text("notes").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    index("adobe_submissions_status_idx").on(table.status),
    uniqueIndex("adobe_submissions_asset_idx").on(table.generatedAssetId),
  ],
);

export const royaltySnapshots = pgTable(
  "royalty_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => adobeSubmissions.id, { onDelete: "cascade" }),
    capturedOn: date("captured_on").notNull(),
    downloads: integer("downloads").notNull(),
    royaltiesUsd: numeric("royalties_usd", {
      precision: 12,
      scale: 2,
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("royalty_snapshots_submission_date_idx").on(
      table.submissionId,
      table.capturedOn,
    ),
  ],
);

export const prohibitedTerms = pgTable(
  "prohibited_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    term: varchar("term", { length: 160 }).notNull(),
    reason: text("reason").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("prohibited_terms_term_idx").on(table.term)],
);

export const applicationSettings = pgTable("application_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  monthlyBudgetIdr: integer("monthly_budget_idr").notNull().default(500_000),
  usdToIdr: numeric("usd_to_idr", { precision: 12, scale: 2 })
    .notNull()
    .default("16250"),
  candidateLimit: integer("candidate_limit").notNull().default(6),
  mockMode: boolean("mock_mode").notNull().default(true),
  allowBudgetOverride: boolean("allow_budget_override")
    .notNull()
    .default(false),
  creativeUpscaleEnabled: boolean("creative_upscale_enabled")
    .notNull()
    .default(false),
  adobeMinimumMegapixels: numeric("adobe_minimum_megapixels", {
    precision: 6,
    scale: 2,
  })
    .notNull()
    .default("4"),
  preparationTargetMegapixels: numeric("preparation_target_megapixels", {
    precision: 6,
    scale: 2,
  })
    .notNull()
    .default("4.2"),
  localUpscaleEnabled: boolean("local_upscale_enabled")
    .notNull()
    .default(false),
  storageDriver: varchar("storage_driver", { length: 30 })
    .notNull()
    .default("local"),
  ...timestamps,
});

export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
