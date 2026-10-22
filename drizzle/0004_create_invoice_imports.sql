CREATE TABLE "invoice_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_sha256" text NOT NULL,
	"row_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_imports_user_id_file_sha256_unique" UNIQUE("user_id","file_sha256")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_imports" ADD CONSTRAINT "invoice_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_import_id_invoice_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."invoice_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_import_id_idx" ON "invoices" USING btree ("import_id");