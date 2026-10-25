ALTER TABLE "email_outbox" DROP CONSTRAINT "email_outbox_template_check";--> statement-breakpoint
DELETE FROM "email_outbox" WHERE "template" = 'invoice_imported';--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_template_check" CHECK ("email_outbox"."template" in ('invoice_paid', 'payment_failed', 'checkout_expired', 'import_completed'));