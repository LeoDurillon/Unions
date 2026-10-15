CREATE TABLE `container_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`command` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`exit_code` integer,
	`error` text,
	`output` text DEFAULT '' NOT NULL,
	`timeout_sec` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `container_runs_ticket_idx` ON `container_runs` (`ticket_id`,`id`);