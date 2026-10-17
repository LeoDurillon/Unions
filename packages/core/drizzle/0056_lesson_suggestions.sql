CREATE TABLE `lesson_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`feedback_ids` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`suggestions` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lesson_suggestions_project_idx` ON `lesson_suggestions` (`project_id`,`id`);