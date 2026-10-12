ALTER TABLE `tickets` ADD `parent_ticket_id` integer REFERENCES tickets(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `tickets` ADD `base_branch` text;