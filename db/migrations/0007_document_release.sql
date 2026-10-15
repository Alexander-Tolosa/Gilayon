CREATE TABLE "document_release" (
	"release_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"document_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"released_by" text NOT NULL,
	"released_at" bigint NOT NULL,
	CONSTRAINT "document_release_one" UNIQUE("kind","document_id")
);
--> statement-breakpoint
ALTER TABLE "document_release" ADD CONSTRAINT "document_release_patient_id_patient_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER document_release_append_only BEFORE UPDATE OR DELETE ON document_release FOR EACH ROW EXECUTE FUNCTION himsog_append_only();
