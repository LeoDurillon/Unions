CREATE TABLE `agent_configs` (
	`agent` text PRIMARY KEY NOT NULL,
	`model` text,
	`prompt` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
