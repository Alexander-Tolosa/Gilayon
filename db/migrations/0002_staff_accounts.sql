ALTER TABLE "staff" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;