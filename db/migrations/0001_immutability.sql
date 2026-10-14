-- Signed records are never edited. A signed document may only be voided (status + void_reason).
-- Consultations are append-only: corrections are new rows that point at the original.
CREATE OR REPLACE FUNCTION himsog_guard_signed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Signed or voided records cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'Voided records cannot be changed';
  END IF;
  IF OLD.status = 'signed' THEN
    IF NEW.status <> 'voided' THEN
      RAISE EXCEPTION 'Signed records cannot be edited; void and reissue instead';
    END IF;
    -- Only the status and the void reason may differ.
    IF (to_jsonb(NEW) - 'status' - 'void_reason') <> (to_jsonb(OLD) - 'status' - 'void_reason') THEN
      RAISE EXCEPTION 'Only the status and void reason of a signed record may change';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER prescription_guard BEFORE UPDATE OR DELETE ON prescription FOR EACH ROW EXECUTE FUNCTION himsog_guard_signed();
--> statement-breakpoint
CREATE TRIGGER document_guard BEFORE UPDATE OR DELETE ON document FOR EACH ROW EXECUTE FUNCTION himsog_guard_signed();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION himsog_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: add a correction instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER consultation_append_only BEFORE UPDATE OR DELETE ON consultation FOR EACH ROW EXECUTE FUNCTION himsog_append_only();
--> statement-breakpoint
CREATE TRIGGER audit_log_guard BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION himsog_append_only();
