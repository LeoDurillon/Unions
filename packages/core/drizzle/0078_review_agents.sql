CREATE TABLE `review_agent_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`review_id` integer,
	`agent_id` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`specs` text NOT NULL,
	`head_sha` text,
	`output` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `custom_agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_agent_runs_ticket_idx` ON `review_agent_runs` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `review_agent_runs_review_idx` ON `review_agent_runs` (`review_id`);--> statement-breakpoint
ALTER TABLE `custom_agents` ADD `kind` text DEFAULT 'step' NOT NULL;