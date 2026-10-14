CREATE TABLE `diff_commit_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`commit_id` integer NOT NULL,
	`position` integer NOT NULL,
	`path` text NOT NULL,
	`old_path` text NOT NULL,
	`status` text NOT NULL,
	`binary` integer NOT NULL,
	`additions` integer NOT NULL,
	`deletions` integer NOT NULL,
	`patch` text NOT NULL,
	FOREIGN KEY (`commit_id`) REFERENCES `diff_commits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diff_commit_files_commit_idx` ON `diff_commit_files` (`commit_id`,`position`);--> statement-breakpoint
CREATE TABLE `diff_commits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`kind` text NOT NULL,
	`position` integer NOT NULL,
	`sha` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`date` text,
	`parents` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `diff_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diff_commits_snapshot_idx` ON `diff_commits` (`snapshot_id`,`position`);--> statement-breakpoint
ALTER TABLE `tickets` ADD `reviewed_sha` text;