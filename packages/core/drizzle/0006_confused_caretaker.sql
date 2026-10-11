CREATE TABLE `diff_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`position` integer NOT NULL,
	`path` text NOT NULL,
	`old_path` text NOT NULL,
	`status` text NOT NULL,
	`binary` integer NOT NULL,
	`additions` integer NOT NULL,
	`deletions` integer NOT NULL,
	`patch` text NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `diff_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diff_files_snapshot_idx` ON `diff_files` (`snapshot_id`,`position`);--> statement-breakpoint
CREATE TABLE `diff_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`base_branch` text NOT NULL,
	`head_sha` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`path` text NOT NULL,
	`side` text NOT NULL,
	`start_line` integer NOT NULL,
	`end_line` integer NOT NULL,
	`excerpt` text NOT NULL,
	`body` text NOT NULL,
	`head_sha` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_comments_ticket_idx` ON `review_comments` (`ticket_id`,`status`);