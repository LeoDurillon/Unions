PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_container_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`review_id` integer,
	`command` text NOT NULL,
	`script_name` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`exit_code` integer,
	`error` text,
	`output` text DEFAULT '' NOT NULL,
	`timeout_sec` integer NOT NULL,
	`for_agent` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "container_runs_one_owner" CHECK(("ticket_id" IS NULL) <> ("review_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_container_runs`("id", "ticket_id", "review_id", "command", "script_name", "status", "exit_code", "error", "output", "timeout_sec", "for_agent", "created_at", "started_at", "finished_at") SELECT "id", "ticket_id", NULL, "command", "script_name", "status", "exit_code", "error", "output", "timeout_sec", "for_agent", "created_at", "started_at", "finished_at" FROM `container_runs`;--> statement-breakpoint
DROP TABLE `container_runs`;--> statement-breakpoint
ALTER TABLE `__new_container_runs` RENAME TO `container_runs`;--> statement-breakpoint
CREATE INDEX `container_runs_ticket_idx` ON `container_runs` (`ticket_id`,`id`);--> statement-breakpoint
CREATE INDEX `container_runs_review_idx` ON `container_runs` (`review_id`,`id`);--> statement-breakpoint
CREATE TABLE `__new_previews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`review_id` integer,
	`project_id` integer NOT NULL,
	`status` text NOT NULL,
	`url` text,
	`urls` text,
	`error` text,
	`log_tail` text,
	`log_at` integer,
	`compose_yaml` text,
	`compose_error` text,
	`compose_at` integer,
	`compose_catalog` text,
	`override` text,
	`override_at` integer,
	`started_at` integer,
	`e2e_status` text,
	`e2e_output` text,
	`e2e_exit_code` integer,
	`e2e_screenshots` integer,
	`e2e_at` integer,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "previews_one_owner" CHECK(("ticket_id" IS NULL) <> ("review_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_previews`("ticket_id", "review_id", "project_id", "status", "url", "urls", "error", "log_tail", "log_at", "compose_yaml", "compose_error", "compose_at", "compose_catalog", "override", "override_at", "started_at", "e2e_status", "e2e_output", "e2e_exit_code", "e2e_screenshots", "e2e_at", "updated_at") SELECT p."ticket_id", NULL, t."project_id", p."status", p."url", p."urls", p."error", p."log_tail", p."log_at", p."compose_yaml", p."compose_error", p."compose_at", p."compose_catalog", p."override", p."override_at", p."started_at", p."e2e_status", p."e2e_output", p."e2e_exit_code", p."e2e_screenshots", p."e2e_at", p."updated_at" FROM `previews` p JOIN `tickets` t ON t."id" = p."ticket_id";--> statement-breakpoint
DROP TABLE `previews`;--> statement-breakpoint
ALTER TABLE `__new_previews` RENAME TO `previews`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `previews_ticket_idx` ON `previews` (`ticket_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `previews_review_idx` ON `previews` (`review_id`);--> statement-breakpoint
ALTER TABLE `current_reviews` ADD `from_fork` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `preview_screenshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`preview_id` integer NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`preview_id`) REFERENCES `previews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preview_screenshots_idx` ON `preview_screenshots` (`preview_id`,`name`);
