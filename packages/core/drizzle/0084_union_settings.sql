CREATE TABLE `union_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`agent_memory_mb` integer NOT NULL,
	`preview_service_memory_mb` integer NOT NULL,
	`cpus` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
