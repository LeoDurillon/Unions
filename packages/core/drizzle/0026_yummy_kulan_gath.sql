CREATE TABLE `event_cursors` (
	`name` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer NOT NULL,
	`event_seq` integer NOT NULL,
	`ticket_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`detail` text,
	`error` text,
	`next_attempt_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`rule_id`) REFERENCES `event_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_deliveries_rule_event_idx` ON `event_deliveries` (`rule_id`,`event_seq`);--> statement-breakpoint
CREATE INDEX `event_deliveries_pending_idx` ON `event_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `event_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`trigger` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_rules_project_idx` ON `event_rules` (`project_id`);--> statement-breakpoint
CREATE TABLE `notion_data_sources` (
	`project_id` integer PRIMARY KEY NOT NULL,
	`data_source_id` text NOT NULL,
	`title` text NOT NULL,
	`properties` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `tickets` ADD `notion_page_id` text;