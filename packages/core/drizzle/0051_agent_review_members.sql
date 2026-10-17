CREATE TABLE `agent_review_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_review_id` integer NOT NULL,
	`review_id` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`agent_review_id`) REFERENCES `agent_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_review_members_idx` ON `agent_review_members` (`agent_review_id`,`review_id`);--> statement-breakpoint
CREATE INDEX `agent_review_members_review_idx` ON `agent_review_members` (`review_id`);