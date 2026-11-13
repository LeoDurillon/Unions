ALTER TABLE `union_settings` ADD `max_concurrent_runs` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `union_settings` ADD `max_previews` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `union_settings` ADD `github_pull_seconds` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `union_settings` ADD `max_project_file_mb` integer DEFAULT 2048 NOT NULL;--> statement-breakpoint
ALTER TABLE `union_settings` ADD `agent_image` text;--> statement-breakpoint
ALTER TABLE `union_settings` ADD `agent_base_image` text;--> statement-breakpoint
ALTER TABLE `union_settings` ADD `compose_image` text;