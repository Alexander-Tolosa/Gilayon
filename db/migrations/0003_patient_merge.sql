ALTER TABLE "patient" ADD COLUMN "merged_into" text;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "merged_at" bigint;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "merged_by" text;