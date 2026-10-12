ALTER TABLE `investigations` ADD `ticket_status` text;--> statement-breakpoint
ALTER TABLE `investigations` ADD `ticket_context` text;--> statement-breakpoint
ALTER TABLE `investigations` ADD `ticket_error` text;--> statement-breakpoint
ALTER TABLE `investigations` ADD `ticket_id` integer REFERENCES tickets(id) ON DELETE set null;