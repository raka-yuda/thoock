ALTER TYPE "public"."derived_asset_type" ADD VALUE 'logo_removed' BEFORE 'sharp_resize';--> statement-breakpoint
ALTER TABLE "generated_assets" ADD COLUMN "provider_request_id" varchar(200);--> statement-breakpoint
ALTER TABLE "generated_assets" ADD COLUMN "logo_removal_status" varchar(30) DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_assets" ADD COLUMN "logo_removal_error" text;--> statement-breakpoint
UPDATE "generated_assets" AS asset
SET "provider_request_id" = job."provider_request_id"
FROM "generation_jobs" AS job
WHERE asset."generation_job_id" = job."id"
  AND job."provider" = 'snapgen'
  AND (job."model" = 'nano-banana-pro' OR job."model" LIKE 'nano-banana-2%')
  AND job."candidate_count" = 1
  AND job."provider_request_id" IS NOT NULL;--> statement-breakpoint
UPDATE "generated_assets" AS asset
SET
  "logo_removal_status" = 'failed',
  "logo_removal_error" = CASE
    WHEN asset."provider_request_id" IS NULL
      THEN 'Historical Nano image is missing its candidate-specific SnapGen generation UUID.'
    ELSE 'Historical Nano image requires provider-mark cleanup before export.'
  END
FROM "generation_jobs" AS job
WHERE asset."generation_job_id" = job."id"
  AND job."provider" = 'snapgen'
  AND (job."model" = 'nano-banana-pro' OR job."model" LIKE 'nano-banana-2%');
