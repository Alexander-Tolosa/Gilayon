CREATE TABLE "allergy" (
	"allergy_id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"substance" text NOT NULL,
	"reaction" text NOT NULL,
	"severity" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"log_id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"action" text NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"summary" text NOT NULL,
	"detail" text,
	"logged_at" bigint NOT NULL,
	"read_at" bigint
);
--> statement-breakpoint
CREATE TABLE "client_op" (
	"op_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"staff_id" text NOT NULL,
	"applied_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultation" (
	"consultation_id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"ticket_id" text,
	"doctor_id" text NOT NULL,
	"service_type" text NOT NULL,
	"consult_date" text NOT NULL,
	"created_at" bigint NOT NULL,
	"chief_complaint" text NOT NULL,
	"treatment_notes" text NOT NULL,
	"vitals" jsonb,
	"correction_of" text,
	CONSTRAINT "consultation_ticket_id_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
CREATE TABLE "counter" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnosis" (
	"diagnosis_id" text PRIMARY KEY NOT NULL,
	"consultation_id" text NOT NULL,
	"description" text NOT NULL,
	"icd10_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"document_id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"consultation_id" text,
	"doctor_id" text NOT NULL,
	"signed_by" text,
	"doc_type" text NOT NULL,
	"purpose" text NOT NULL,
	"findings" text NOT NULL,
	"rest_days" integer,
	"remarks" text,
	"status" text NOT NULL,
	"issued_at" bigint,
	"created_at" bigint NOT NULL,
	"document_no" text,
	"signature" text,
	"void_reason" text,
	"replaces" text,
	CONSTRAINT "document_document_no_unique" UNIQUE("document_no")
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"employee_id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"employee_no" text NOT NULL,
	"office" text NOT NULL,
	"position" text NOT NULL,
	CONSTRAINT "employee_person_id_unique" UNIQUE("person_id"),
	CONSTRAINT "employee_employee_no_unique" UNIQUE("employee_no")
);
--> statement-breakpoint
CREATE TABLE "family_history" (
	"history_id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"relative" text NOT NULL,
	"condition" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "lab_order" (
	"lab_id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"consultation_id" text,
	"requested_by" text NOT NULL,
	"test_name" text NOT NULL,
	"status" text NOT NULL,
	"result" text,
	"result_date" text,
	"requested_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient" (
	"patient_id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"patient_no" text NOT NULL,
	"civil_status" text NOT NULL,
	"pwd_id" text,
	"philhealth_pin" text,
	"legacy_folder_no" text,
	"created_at" bigint NOT NULL,
	"created_by" text NOT NULL,
	"hr_flag" text,
	CONSTRAINT "patient_person_id_unique" UNIQUE("person_id"),
	CONSTRAINT "patient_patient_no_unique" UNIQUE("patient_no")
);
--> statement-breakpoint
CREATE TABLE "patient_relationship" (
	"relationship_id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"related_patient_id" text NOT NULL,
	"relationship_type" text NOT NULL,
	"listed_in_mdr" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"person_id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"birthdate" text NOT NULL,
	"sex" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription" (
	"prescription_id" text PRIMARY KEY NOT NULL,
	"consultation_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"signed_by" text,
	"doctor_id" text NOT NULL,
	"status" text NOT NULL,
	"issued_at" bigint,
	"created_at" bigint NOT NULL,
	"document_no" text,
	"signature" text,
	"void_reason" text,
	"replaces" text,
	CONSTRAINT "prescription_document_no_unique" UNIQUE("document_no")
);
--> statement-breakpoint
CREATE TABLE "prescription_item" (
	"item_id" text PRIMARY KEY NOT NULL,
	"prescription_id" text NOT NULL,
	"drug_name" text NOT NULL,
	"dose" text NOT NULL,
	"frequency" text NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "priority_category" (
	"category_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rank" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_ticket" (
	"ticket_id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"category_id" text NOT NULL,
	"categories" text[] NOT NULL,
	"verified_by" text NOT NULL,
	"is_returning" boolean DEFAULT false NOT NULL,
	"queue_no" integer NOT NULL,
	"service_type" text NOT NULL,
	"reason" text,
	"status" text NOT NULL,
	"checked_in_at" bigint NOT NULL,
	"called_at" bigint,
	"done_at" bigint,
	"doctor_id" text,
	"day" text NOT NULL,
	CONSTRAINT "queue_ticket_day_no" UNIQUE("day","queue_no")
);
--> statement-breakpoint
CREATE TABLE "scanned_page" (
	"page_id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"file" text NOT NULL,
	"kind" text NOT NULL,
	"page_date" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"staff_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"title" text NOT NULL,
	"license_no" text,
	"ptr_no" text,
	"services" text[],
	"room" text,
	"signature_image" text,
	"password_hash" text NOT NULL,
	"pin_hash" text
);
--> statement-breakpoint
ALTER TABLE "allergy" ADD CONSTRAINT "allergy_patient_id_patient_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_patient_id_patient_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_ticket_id_queue_ticket_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."queue_ticket"("ticket_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnosis" ADD CONSTRAINT "diagnosis_consultation_id_consultation_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("consultation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_patient_id_patient_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_person_id_person_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("person_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_history" ADD CONSTRAINT "family_history_patient_id_patient_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_patient_id_patient_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient" ADD CONSTRAINT "patient_person_id_person_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("person_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_relationship" ADD CONSTRAINT "patient_relationship_patient_id_patient_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_relationship" ADD CONSTRAINT "patient_relationship_related_patient_id_patient_patient_id_fk" FOREIGN KEY ("related_patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_consultation_id_consultation_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("consultation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_patient_id_patient_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_item" ADD CONSTRAINT "prescription_item_prescription_id_prescription_prescription_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescription"("prescription_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_ticket" ADD CONSTRAINT "queue_ticket_patient_id_patient_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_ticket" ADD CONSTRAINT "queue_ticket_category_id_priority_category_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."priority_category"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_page" ADD CONSTRAINT "scanned_page_patient_id_patient_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("patient_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_staff_id_staff_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("staff_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_logged_at" ON "audit_log" USING btree ("logged_at");--> statement-breakpoint
CREATE INDEX "queue_ticket_day" ON "queue_ticket" USING btree ("day");