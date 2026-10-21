CREATE TABLE `union_update` (
	`id` integer PRIMARY KEY NOT NULL,
	`local_sha` text NOT NULL,
	`remote_sha` text,
	`ahead` integer DEFAULT 0 NOT NULL,
	`behind` integer DEFAULT 0 NOT NULL,
	`subjects` text NOT NULL,
	`refusal` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`error` text,
	`checked_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`status_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
