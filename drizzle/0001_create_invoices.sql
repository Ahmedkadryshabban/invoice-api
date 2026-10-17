CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"customer_email" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_user_id_idx" ON "invoices" USING btree ("user_id");