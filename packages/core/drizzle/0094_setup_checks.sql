CREATE TABLE `setup_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`investigation_id` integer NOT NULL,
	`kind` text NOT NULL,
	`input` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text,
	`output` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`investigation_id`) REFERENCES `investigations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `setup_checks_investigation_idx` ON `setup_checks` (`investigation_id`,`kind`,`id`);