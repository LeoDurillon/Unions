CREATE TABLE `ticket_slices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`spec` text NOT NULL,
	`tip_sha` text NOT NULL,
	`branch` text NOT NULL,
	`pr_number` integer,
	`pr_state` text,
	`pr_merged_at` integer,
	`merged_into` text,
	`merged_tip_sha` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_slices_ticket_idx` ON `ticket_slices` (`ticket_id`,`position`);