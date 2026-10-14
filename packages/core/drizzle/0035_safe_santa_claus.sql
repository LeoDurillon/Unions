CREATE TABLE `review_groupings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`review_id` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`source_kind` text NOT NULL,
	`source_label` text NOT NULL,
	`spec` text NOT NULL,
	`head_sha` text,
	`result` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_groupings_ticket_idx` ON `review_groupings` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `review_groupings_review_idx` ON `review_groupings` (`review_id`);