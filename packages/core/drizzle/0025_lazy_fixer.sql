CREATE TABLE `agent_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`review_id` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`comments` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_reviews_ticket_idx` ON `agent_reviews` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `agent_reviews_review_idx` ON `agent_reviews` (`review_id`);--> statement-breakpoint
ALTER TABLE `review_comments` ADD `author` text DEFAULT 'user' NOT NULL;