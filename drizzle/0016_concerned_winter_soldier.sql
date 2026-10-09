ALTER TABLE "generated_assets" ADD COLUMN "active_derived_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "generated_assets" ADD CONSTRAINT "generated_assets_active_derived_asset_id_derived_assets_id_fk" FOREIGN KEY ("active_derived_asset_id") REFERENCES "public"."derived_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_assets_active_derived_idx" ON "generated_assets" USING btree ("active_derived_asset_id");--> statement-breakpoint
UPDATE "generated_assets" AS "asset"
SET "active_derived_asset_id" = (
	SELECT "derived"."id"
	FROM "derived_assets" AS "derived"
	WHERE "derived"."source_asset_id" = "asset"."id"
		AND "derived"."type" = 'logo_removed'
	ORDER BY "derived"."created_at" DESC
	LIMIT 1
)
WHERE EXISTS (
	SELECT 1
	FROM "derived_assets" AS "derived"
	WHERE "derived"."source_asset_id" = "asset"."id"
		AND "derived"."type" = 'logo_removed'
);
