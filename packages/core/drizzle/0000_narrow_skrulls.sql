CREATE TABLE `commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`type` text NOT NULL,
	`payload` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`handled_at` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `commands_pending_idx` ON `commands` (`handled_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`run_id` integer,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_ticket_idx` ON `events` (`ticket_id`,`seq`);--> statement-breakpoint
CREATE TABLE `feedback_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`ticket_id` integer,
	`section` text NOT NULL,
	`text` text NOT NULL,
	`curated_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`section` text NOT NULL,
	`rule` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lessons_idx` ON `lessons` (`project_id`,`section`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`github_project_node_id` text NOT NULL,
	`status_field_id` text,
	`config` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_repo_idx` ON `projects` (`owner`,`repo`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`step` text NOT NULL,
	`iteration` integer DEFAULT 1 NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`session_id` text,
	`cost_micro_usd` integer,
	`error` text,
	`started_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `step_outputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`step` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`github_comment_id` text,
	`validation` text DEFAULT 'pending' NOT NULL,
	`feedback` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `step_outputs_idx` ON `step_outputs` (`ticket_id`,`step`,`version`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`issue_number` integer,
	`issue_node_id` text,
	`project_item_id` text,
	`phase` text DEFAULT '{"kind":"backlog"}' NOT NULL,
	`branch` text,
	`pr_number` integer,
	`container_name` text,
	`home_volume` text,
	`workspace_volume` text,
	`session_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tickets_project_idx` ON `tickets` (`project_id`);