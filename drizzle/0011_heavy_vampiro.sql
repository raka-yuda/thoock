ALTER TABLE "commercial_briefs" ADD COLUMN "metadata_title" varchar(70) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_briefs" ADD COLUMN "metadata_category" varchar(2) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_briefs" ADD COLUMN "metadata_language" varchar(10) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_briefs" ADD COLUMN "metadata_keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_briefs" ADD COLUMN "metadata_fictional_people_property" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "commercial_briefs" ADD COLUMN "metadata_notes" text DEFAULT '' NOT NULL;