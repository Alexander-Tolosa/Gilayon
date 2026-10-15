ALTER TABLE "patient" ADD COLUMN "paper_status" text;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "paper_checked_at" bigint;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "paper_checked_by" text;