CREATE TYPE "public"."provider_request_log_status" AS ENUM('started', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "provider_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_job_id" uuid,
	"source_path" varchar(160) NOT NULL,
	"idempotency_key" varchar(100) NOT NULL,
	"provider" varchar(60) NOT NULL,
	"model" varchar(160) NOT NULL,
	"operation" varchar(60) DEFAULT 'image_generation' NOT NULL,
	"status" "provider_request_log_status" DEFAULT 'started' NOT NULL,
	"request_body" jsonb NOT NULL,
	"provider_request_body" jsonb NOT NULL,
	"response_body" jsonb,
	"provider_request_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"estimated_cost_usd" numeric(12, 6),
	"actual_cost_usd" numeric(12, 6),
	"duration_ms" integer,
	"error_details" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_request_logs" ADD CONSTRAINT "provider_request_logs_generation_job_id_generation_jobs_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_request_logs_created_idx" ON "provider_request_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "provider_request_logs_status_idx" ON "provider_request_logs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "provider_request_logs_provider_idx" ON "provider_request_logs" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "provider_request_logs_job_idx" ON "provider_request_logs" USING btree ("generation_job_id");--> statement-breakpoint
CREATE INDEX "provider_request_logs_idempotency_idx" ON "provider_request_logs" USING btree ("idempotency_key");