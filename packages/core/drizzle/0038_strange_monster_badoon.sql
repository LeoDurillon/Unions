CREATE TABLE `mcp_connector_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `mcp_connectors` (
	`name` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`status` text NOT NULL,
	`connected` integer NOT NULL,
	`checked_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
