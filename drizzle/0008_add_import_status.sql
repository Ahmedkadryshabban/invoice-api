ALTER TABLE "invoice_imports" DROP CONSTRAINT "invoice_imports_user_id_file_sha256_unique";--> statement-breakpoint
ALTER TABLE "invoice_imports" ALTER COLUMN "row_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_imports" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "invoice_imports" ADD COLUMN "file" "bytea";--> statement-breakpoint
ALTER TABLE "invoice_imports" ADD COLUMN "status" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_imports" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "invoice_imports" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "invoice_imports" ADD COLUMN "errors" jsonb;--> statement-breakpoint
ALTER TABLE "invoice_imports" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_imports_user_id_file_sha256_active_unique" ON "invoice_imports" USING btree ("user_id","file_sha256") WHERE "invoice_imports"."status" <> 'failed';--> statement-breakpoint
ALTER TABLE "invoice_imports" ADD CONSTRAINT "invoice_imports_status_check" CHECK ("invoice_imports"."status" in ('pending', 'processing', 'completed', 'failed'));--> statement-breakpoint
UPDATE "invoice_imports" SET "completed_at" = "created_at";