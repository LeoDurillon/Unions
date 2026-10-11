PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`github_project_node_id` text DEFAULT '' NOT NULL,
	`github_project_url` text,
	`status_field_id` text,
	`config` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "owner", "repo", "github_project_node_id", "github_project_url", "status_field_id", "config", "created_at", "updated_at") SELECT "id", "owner", "repo", "github_project_node_id", "github_project_url", "status_field_id", "config", "created_at", "updated_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_repo_idx` ON `projects` (`owner`,`repo`);