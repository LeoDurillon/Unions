PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_review_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`review_id` integer,
	`kind` text DEFAULT 'line' NOT NULL,
	`path` text NOT NULL,
	`side` text NOT NULL,
	`start_line` integer NOT NULL,
	`end_line` integer NOT NULL,
	`excerpt` text NOT NULL,
	`body` text NOT NULL,
	`head_sha` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_at` integer,
	`github_url` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_review_comments`("id", "ticket_id", "kind", "path", "side", "start_line", "end_line", "excerpt", "body", "head_sha", "status", "sent_at", "github_url", "created_at") SELECT "id", "ticket_id", "kind", "path", "side", "start_line", "end_line", "excerpt", "body", "head_sha", "status", "sent_at", "github_url", "created_at" FROM `review_comments`;--> statement-breakpoint
DROP TABLE `review_comments`;--> statement-breakpoint
ALTER TABLE `__new_review_comments` RENAME TO `review_comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `review_comments_ticket_idx` ON `review_comments` (`ticket_id`,`status`);--> statement-breakpoint
CREATE INDEX `review_comments_review_idx` ON `review_comments` (`review_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_comments_github_idx` ON `review_comments` (`ticket_id`,`github_url`);--> statement-breakpoint
ALTER TABLE `current_reviews` ADD `files` text;--> statement-breakpoint
ALTER TABLE `current_reviews` ADD `head_sha` text;--> statement-breakpoint
ALTER TABLE `current_reviews` ADD `submit_status` text;--> statement-breakpoint
ALTER TABLE `current_reviews` ADD `submit_error` text;