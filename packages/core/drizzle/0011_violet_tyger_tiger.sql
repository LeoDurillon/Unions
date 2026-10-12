CREATE TABLE `agent_tools` (
	`name` text PRIMARY KEY NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `agent_configs` ADD `tools` text;