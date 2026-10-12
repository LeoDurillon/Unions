CREATE TABLE `investigations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`scope` text NOT NULL,
	`model` text NOT NULL,
	`tools` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `investigations_project_idx` ON `investigations` (`project_id`);--> statement-breakpoint
ALTER TABLE `events` ADD `investigation_id` integer;--> statement-breakpoint
CREATE INDEX `events_investigation_idx` ON `events` (`investigation_id`,`seq`);