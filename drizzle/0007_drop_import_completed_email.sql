ALTER TABLE "email_outbox" DROP CONSTRAINT "email_outbox_template_check";--> statement-breakpoint
DELETE FROM "email_outbox" WHERE "template" = 'import_completed';--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_template_check" CHECK ("email_outbox"."template" in ('invoice_paid', 'payment_failed', 'checkout_expired'));