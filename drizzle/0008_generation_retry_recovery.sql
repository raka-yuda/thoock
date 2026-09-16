ALTER TABLE "generation_jobs" ADD COLUMN "retry_of_job_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "failure_kind" varchar(40);--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_retry_of_job_id_generation_jobs_id_fk" FOREIGN KEY ("retry_of_job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_jobs_retry_idx" ON "generation_jobs" USING btree ("retry_of_job_id");