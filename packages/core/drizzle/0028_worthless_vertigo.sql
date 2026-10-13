CREATE TABLE `pr_descriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`pr_number` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`original` text,
	`text` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`sent_at` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pr_descriptions_ticket_idx` ON `pr_descriptions` (`ticket_id`,`id`);