CREATE TYPE "public"."generation_strategy" AS ENUM('economical', 'direct_4mp', 'custom');--> statement-breakpoint
CREATE TABLE "generation_model_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar(60) NOT NULL,
	"provider_model_id" varchar(160) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"supported_resolutions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supported_aspect_ratios" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"supported_quality_levels" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"output_formats" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"supports_negative_prompt" boolean DEFAULT false NOT NULL,
	"supports_seed" boolean DEFAULT false NOT NULL,
	"supports_reference_images" boolean DEFAULT false NOT NULL,
	"generation_price_usd" numeric(12, 6),
	"pricing_unit" varchar(30) DEFAULT 'unknown' NOT NULL,
	"credit_cost" numeric(12, 4),
	"commercial_use_status" varchar(30) DEFAULT 'unverified' NOT NULL,
	"commercial_terms_reference" text,
	"last_pricing_verification_date" date,
	"endpoint_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_settings" ADD COLUMN "adobe_minimum_megapixels" numeric(6, 2) DEFAULT '4' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_settings" ADD COLUMN "preparation_target_megapixels" numeric(6, 2) DEFAULT '4.2' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_settings" ADD COLUMN "local_upscale_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_assets" ADD COLUMN "provider_reported_width" integer;--> statement-breakpoint
ALTER TABLE "generated_assets" ADD COLUMN "provider_reported_height" integer;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "strategy" "generation_strategy" DEFAULT 'economical' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "resolution" varchar(80) DEFAULT 'unspecified' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "quality" varchar(80);--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "aspect_ratio" varchar(20) DEFAULT '1:1' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "seed" integer;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "model_capability_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_model_capability_provider_model_idx" ON "generation_model_capabilities" USING btree ("provider_id","provider_model_id");--> statement-breakpoint
CREATE INDEX "generation_model_capability_enabled_idx" ON "generation_model_capabilities" USING btree ("enabled","provider_id");