CREATE TABLE `shared_stacks` (
	`project_id` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`services` text NOT NULL,
	`previews` text NOT NULL,
	`agents` text NOT NULL,
	`error` text,
	`started_at` integer,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
