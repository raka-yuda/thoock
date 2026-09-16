ALTER TABLE "generation_jobs" ADD COLUMN "strategy_estimate_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "expected_selected_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "estimated_upscale_cost_usd" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "estimated_pipeline_cost_usd" numeric(12, 4);