ALTER TABLE "generation_jobs" ADD COLUMN "provider_request_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL;
--> statement-breakpoint
UPDATE "generation_jobs"
SET "provider_request_ids" = ARRAY["provider_request_id"]
WHERE "provider_request_id" IS NOT NULL
  AND cardinality("provider_request_ids") = 0;
