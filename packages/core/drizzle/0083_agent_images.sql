CREATE TABLE `agent_images` (
	`project_id` integer PRIMARY KEY NOT NULL,
	`applied` text,
	`pending` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`error` text,
	`output` text DEFAULT '' NOT NULL,
	`saved_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
