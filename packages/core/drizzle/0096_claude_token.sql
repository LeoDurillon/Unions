CREATE TABLE `claude_token` (
	`id` integer PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`saved_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
