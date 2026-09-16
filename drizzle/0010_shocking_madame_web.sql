DROP INDEX "asset_reviews_generated_idx";--> statement-breakpoint
CREATE INDEX "generated_assets_created_idx" ON "generated_assets" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "asset_reviews_generated_idx" ON "asset_reviews" USING btree ("generated_asset_id","created_at");