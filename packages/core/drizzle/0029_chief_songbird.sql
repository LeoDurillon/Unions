CREATE TABLE `previews` (
	`ticket_id` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`url` text,
	`error` text,
	`log_tail` text,
	`log_at` integer,
	`started_at` integer,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
