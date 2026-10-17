CREATE TABLE `ci_outputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`head_sha` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`text` text NOT NULL,
	`for_agent` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ci_outputs_ticket_idx` ON `ci_outputs` (`ticket_id`,`id`);