CREATE TYPE "public"."brief_status" AS ENUM('draft', 'ready', 'generating', 'complete', 'archived');--> statement-breakpoint
CREATE TYPE "public"."derived_asset_type" AS ENUM('sharp_resize', 'ai_upscale', 'prepared_jpeg');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('researching', 'shortlisted', 'briefed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('evergreen', 'seasonal', 'trending');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('pending', 'approved', 'rejected', 'regenerate');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('draft', 'ready', 'submitted', 'under_review', 'accepted', 'rejected', 'published', 'removed');--> statement-breakpoint
CREATE TYPE "public"."upscale_status" AS ENUM('not_inspected', 'upscale_not_required', 'upscale_required', 'waiting_for_confirmation', 'upscaling', 'upscaled', 'upscale_failed', 'awaiting_final_review', 'approved_after_upscale');--> statement-breakpoint
CREATE TABLE "adobe_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_asset_id" uuid NOT NULL,
	"export_batch_id" uuid,
	"submission_date" date,
	"adobe_asset_id" varchar(120),
	"status" "submission_status" DEFAULT 'draft' NOT NULL,
	"accepted_date" date,
	"rejected_date" date,
	"rejection_reason" text,
	"publication_date" date,
	"downloads" integer DEFAULT 0 NOT NULL,
	"total_royalties_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monthly_budget_idr" integer DEFAULT 500000 NOT NULL,
	"usd_to_idr" numeric(12, 2) DEFAULT '16250' NOT NULL,
	"candidate_limit" integer DEFAULT 6 NOT NULL,
	"mock_mode" boolean DEFAULT true NOT NULL,
	"allow_budget_override" boolean DEFAULT false NOT NULL,
	"creative_upscale_enabled" boolean DEFAULT false NOT NULL,
	"storage_driver" varchar(30) DEFAULT 'local' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_asset_id" uuid NOT NULL,
	"prepared_asset_id" uuid,
	"filename" varchar(30) NOT NULL,
	"title" varchar(70) NOT NULL,
	"category" varchar(80) NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"keywords" text[] NOT NULL,
	"generative_ai" boolean DEFAULT true NOT NULL,
	"fictional_people_property" boolean DEFAULT false NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_asset_id" uuid,
	"derived_asset_id" uuid,
	"stage" varchar(30) DEFAULT 'candidate' NOT NULL,
	"decision" "review_decision" DEFAULT 'pending' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid,
	"name" varchar(160) NOT NULL,
	"target_buyer" text NOT NULL,
	"intended_usage" text NOT NULL,
	"target_market" varchar(100) NOT NULL,
	"main_subject" text NOT NULL,
	"supporting_subjects" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"environment" text NOT NULL,
	"visual_style" text NOT NULL,
	"orientation" varchar(24) NOT NULL,
	"composition" text NOT NULL,
	"copy_space_location" varchar(40) NOT NULL,
	"lighting" text NOT NULL,
	"mood" text NOT NULL,
	"representation_notes" text DEFAULT '' NOT NULL,
	"prohibited_elements" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"candidate_count" integer DEFAULT 4 NOT NULL,
	"status" "brief_status" DEFAULT 'draft' NOT NULL,
	"generation_prompt" text NOT NULL,
	"negative_prompt" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"source_derived_asset_id" uuid,
	"type" "derived_asset_type" NOT NULL,
	"provider" varchar(60) NOT NULL,
	"method" varchar(60) NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"megapixels" numeric(10, 4) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"perceptual_hash" varchar(64) NOT NULL,
	"may_reinterpret_detail" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_batch_id" uuid NOT NULL,
	"generated_asset_id" uuid NOT NULL,
	"prepared_asset_id" uuid NOT NULL,
	"filename" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(140) NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"storage_key" text,
	"item_count" integer DEFAULT 0 NOT NULL,
	"csv_bytes" integer,
	"manifest" jsonb,
	"compliance_report" jsonb,
	"error_details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_job_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"megapixels" numeric(10, 4) NOT NULL,
	"file_size" integer NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"perceptual_hash" varchar(64) NOT NULL,
	"has_metadata" boolean DEFAULT false NOT NULL,
	"upscale_status" "upscale_status" DEFAULT 'not_inspected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"idempotency_key" varchar(100) NOT NULL,
	"prompt" text NOT NULL,
	"negative_prompt" text DEFAULT '' NOT NULL,
	"provider" varchar(60) NOT NULL,
	"model" varchar(100) NOT NULL,
	"requested_width" integer NOT NULL,
	"requested_height" integer NOT NULL,
	"candidate_count" integer NOT NULL,
	"provider_request_id" varchar(200),
	"estimated_cost_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"actual_cost_usd" numeric(12, 4),
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error_details" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" varchar(120) NOT NULL,
	"target_region" varchar(80) NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"target_event_date" date,
	"adobe_result_count" integer DEFAULT 0 NOT NULL,
	"trend_growth" numeric(6, 2) NOT NULL,
	"commercial_intent" numeric(6, 2) NOT NULL,
	"seasonality" numeric(6, 2) NOT NULL,
	"portfolio_performance" numeric(6, 2) NOT NULL,
	"opportunity_score" numeric(6, 2) NOT NULL,
	"score_explanation" text NOT NULL,
	"status" "opportunity_status" DEFAULT 'researching' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"provider" varchar(60) NOT NULL,
	"signal_type" varchar(60) NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"is_estimate" boolean DEFAULT true NOT NULL,
	"raw_payload" jsonb,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prohibited_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" varchar(160) NOT NULL,
	"reason" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_review_id" uuid NOT NULL,
	"check_key" varchar(100) NOT NULL,
	"label" text NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"advisory" boolean DEFAULT false NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "royalty_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"captured_on" date NOT NULL,
	"downloads" integer NOT NULL,
	"royalties_usd" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upscale_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"derived_asset_id" uuid,
	"idempotency_key" varchar(100) NOT NULL,
	"provider" varchar(60) NOT NULL,
	"method" varchar(60) NOT NULL,
	"target_width" integer NOT NULL,
	"target_height" integer NOT NULL,
	"estimated_cost_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"actual_cost_usd" numeric(12, 4),
	"provider_request_id" text,
	"status" "upscale_status" DEFAULT 'waiting_for_confirmation' NOT NULL,
	"error_details" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adobe_submissions" ADD CONSTRAINT "adobe_submissions_generated_asset_id_generated_assets_id_fk" FOREIGN KEY ("generated_asset_id") REFERENCES "public"."generated_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adobe_submissions" ADD CONSTRAINT "adobe_submissions_export_batch_id_export_batches_id_fk" FOREIGN KEY ("export_batch_id") REFERENCES "public"."export_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_metadata" ADD CONSTRAINT "asset_metadata_generated_asset_id_generated_assets_id_fk" FOREIGN KEY ("generated_asset_id") REFERENCES "public"."generated_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_metadata" ADD CONSTRAINT "asset_metadata_prepared_asset_id_derived_assets_id_fk" FOREIGN KEY ("prepared_asset_id") REFERENCES "public"."derived_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_reviews" ADD CONSTRAINT "asset_reviews_generated_asset_id_generated_assets_id_fk" FOREIGN KEY ("generated_asset_id") REFERENCES "public"."generated_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_reviews" ADD CONSTRAINT "asset_reviews_derived_asset_id_derived_assets_id_fk" FOREIGN KEY ("derived_asset_id") REFERENCES "public"."derived_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_briefs" ADD CONSTRAINT "commercial_briefs_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_assets" ADD CONSTRAINT "derived_assets_source_asset_id_generated_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."generated_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_batch_items" ADD CONSTRAINT "export_batch_items_export_batch_id_export_batches_id_fk" FOREIGN KEY ("export_batch_id") REFERENCES "public"."export_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_batch_items" ADD CONSTRAINT "export_batch_items_generated_asset_id_generated_assets_id_fk" FOREIGN KEY ("generated_asset_id") REFERENCES "public"."generated_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_batch_items" ADD CONSTRAINT "export_batch_items_prepared_asset_id_derived_assets_id_fk" FOREIGN KEY ("prepared_asset_id") REFERENCES "public"."derived_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_assets" ADD CONSTRAINT "generated_assets_generation_job_id_generation_jobs_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_brief_id_commercial_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."commercial_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_signals" ADD CONSTRAINT "opportunity_signals_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_checks" ADD CONSTRAINT "quality_checks_asset_review_id_asset_reviews_id_fk" FOREIGN KEY ("asset_review_id") REFERENCES "public"."asset_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_snapshots" ADD CONSTRAINT "royalty_snapshots_submission_id_adobe_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."adobe_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upscale_jobs" ADD CONSTRAINT "upscale_jobs_source_asset_id_generated_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."generated_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upscale_jobs" ADD CONSTRAINT "upscale_jobs_derived_asset_id_derived_assets_id_fk" FOREIGN KEY ("derived_asset_id") REFERENCES "public"."derived_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adobe_submissions_status_idx" ON "adobe_submissions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "adobe_submissions_asset_idx" ON "adobe_submissions" USING btree ("generated_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_metadata_generated_idx" ON "asset_metadata" USING btree ("generated_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_metadata_filename_idx" ON "asset_metadata" USING btree ("filename");--> statement-breakpoint
CREATE INDEX "asset_reviews_generated_idx" ON "asset_reviews" USING btree ("generated_asset_id");--> statement-breakpoint
CREATE INDEX "asset_reviews_derived_idx" ON "asset_reviews" USING btree ("derived_asset_id");--> statement-breakpoint
CREATE INDEX "commercial_briefs_opportunity_idx" ON "commercial_briefs" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "commercial_briefs_status_idx" ON "commercial_briefs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "derived_assets_source_idx" ON "derived_assets" USING btree ("source_asset_id");--> statement-breakpoint
CREATE INDEX "derived_assets_phash_idx" ON "derived_assets" USING btree ("perceptual_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "export_batch_items_unique_idx" ON "export_batch_items" USING btree ("export_batch_id","generated_asset_id");--> statement-breakpoint
CREATE INDEX "generated_assets_job_idx" ON "generated_assets" USING btree ("generation_job_id");--> statement-breakpoint
CREATE INDEX "generated_assets_phash_idx" ON "generated_assets" USING btree ("perceptual_hash");--> statement-breakpoint
CREATE INDEX "generated_assets_upscale_idx" ON "generated_assets" USING btree ("upscale_status");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_idempotency_idx" ON "generation_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "generation_jobs_status_idx" ON "generation_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "generation_jobs_brief_idx" ON "generation_jobs" USING btree ("brief_id");--> statement-breakpoint
CREATE INDEX "opportunities_score_idx" ON "opportunities" USING btree ("opportunity_score");--> statement-breakpoint
CREATE INDEX "opportunities_status_idx" ON "opportunities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opportunities_keyword_idx" ON "opportunities" USING btree ("keyword");--> statement-breakpoint
CREATE INDEX "opportunity_signals_opportunity_idx" ON "opportunity_signals" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prohibited_terms_term_idx" ON "prohibited_terms" USING btree ("term");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_checks_review_key_idx" ON "quality_checks" USING btree ("asset_review_id","check_key");--> statement-breakpoint
CREATE UNIQUE INDEX "royalty_snapshots_submission_date_idx" ON "royalty_snapshots" USING btree ("submission_id","captured_on");--> statement-breakpoint
CREATE UNIQUE INDEX "upscale_jobs_idempotency_idx" ON "upscale_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "upscale_jobs_status_idx" ON "upscale_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");