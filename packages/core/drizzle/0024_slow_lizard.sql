CREATE TABLE `refused_commits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`step` text NOT NULL,
	`files` text NOT NULL,
	`hook_output` text NOT NULL,
	`diff` text NOT NULL,
	`diff_hash` text NOT NULL,
	`message` text NOT NULL,
	`report` text NOT NULL,
	`session_id` text,
	`resume_state` text NOT NULL,
	`resolution` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
