CREATE TABLE "recognition_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"patient_id" text,
	"page_id" text,
	"status" text NOT NULL,
	"ocr_engine" text NOT NULL,
	"parse_engine" text NOT NULL,
	"ocr_ms" integer NOT NULL,
	"parse_ms" integer NOT NULL,
	"review_ms" integer,
	"field_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"fields" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	"confirmed_at" bigint,
	"image_file" text,
	"captured_at" bigint,
	"patient_hint" text,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "scanned_page" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "scanned_page" ADD COLUMN "source_clinic" text;--> statement-breakpoint
ALTER TABLE "scanned_page" ADD COLUMN "report_date" text;