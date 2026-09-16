-- Make failures created before retry recovery was introduced visible and
-- actionable without inventing a more specific cause.
UPDATE "generation_jobs"
SET
	"failure_kind" = coalesce("failure_kind", 'unknown'),
	"completed_at" = coalesce("completed_at", "updated_at")
WHERE "status" = 'failed';

-- Earlier synchronous failures left their brief in `generating`. Return only
-- briefs without active work to `ready`; an actually running attempt wins.
UPDATE "commercial_briefs" AS brief
SET
	"status" = 'ready',
	"updated_at" = now()
WHERE brief."status" = 'generating'
	AND EXISTS (
		SELECT 1
		FROM "generation_jobs" AS failed_job
		WHERE failed_job."brief_id" = brief."id"
			AND failed_job."status" = 'failed'
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "generation_jobs" AS active_job
		WHERE active_job."brief_id" = brief."id"
			AND active_job."status" IN ('queued', 'running')
	);
