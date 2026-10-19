CREATE TABLE `review_explanations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`review_id` integer,
	`parent_id` integer,
	`path` text NOT NULL,
	`side` text NOT NULL,
	`start_line` integer NOT NULL,
	`end_line` integer NOT NULL,
	`excerpt` text NOT NULL,
	`question` text,
	`specs` text NOT NULL,
	`head_sha` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text,
	`session_id` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `review_explanations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_explanations_ticket_idx` ON `review_explanations` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `review_explanations_review_idx` ON `review_explanations` (`review_id`);--> statement-breakpoint
ALTER TABLE `agent_log` ADD `explanation_id` integer;--> statement-breakpoint
CREATE INDEX `agent_log_explanation_idx` ON `agent_log` (`explanation_id`,`id`);