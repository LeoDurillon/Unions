CREATE TABLE `review_explain_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`review_id` integer,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_explain_conversations_ticket_idx` ON `review_explain_conversations` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `review_explain_conversations_review_idx` ON `review_explain_conversations` (`review_id`);--> statement-breakpoint
-- Each thread of explanations (a root and its follow-ups) becomes a conversation, numbered as its root.
WITH RECURSIVE `chain`(`id`, `root`) AS (SELECT `id`, `id` FROM `review_explanations` WHERE `parent_id` IS NULL UNION ALL SELECT e.`id`, c.`root` FROM `review_explanations` e JOIN `chain` c ON e.`parent_id` = c.`id`) INSERT INTO `review_explain_conversations`("id", "ticket_id", "review_id", "title", "created_at", "updated_at") SELECT r.`id`, r.`ticket_id`, r.`review_id`, COALESCE(NULLIF(trim(substr(r.`question`, 1, 80)), ''), r.`path` || ':' || CASE WHEN r.`start_line` = r.`end_line` THEN r.`start_line` ELSE r.`start_line` || '-' || r.`end_line` END), r.`created_at`, (SELECT max(e.`created_at`) FROM `chain` c JOIN `review_explanations` e ON e.`id` = c.`id` WHERE c.`root` = r.`id`) FROM `review_explanations` r WHERE r.`parent_id` IS NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_review_explanations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`review_id` integer,
	`conversation_id` integer NOT NULL,
	`subjects` text NOT NULL,
	`question` text,
	`specs` text NOT NULL,
	`head_sha` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text,
	`session_id` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `review_explain_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Each explanation becomes a turn of its thread's conversation, its lines its one subject.
WITH RECURSIVE `chain`(`id`, `root`) AS (SELECT `id`, `id` FROM `review_explanations` WHERE `parent_id` IS NULL UNION ALL SELECT e.`id`, c.`root` FROM `review_explanations` e JOIN `chain` c ON e.`parent_id` = c.`id`) INSERT INTO `__new_review_explanations`("id", "ticket_id", "review_id", "conversation_id", "subjects", "question", "specs", "head_sha", "status", "result", "session_id", "error", "created_at", "started_at", "finished_at") SELECT e.`id`, e.`ticket_id`, e.`review_id`, c.`root`, json_array(json_object('kind', 'lines', 'path', e.`path`, 'side', e.`side`, 'start', e.`start_line`, 'end', e.`end_line`, 'excerpt', e.`excerpt`)), e.`question`, e.`specs`, e.`head_sha`, e.`status`, e.`result`, e.`session_id`, e.`error`, e.`created_at`, e.`started_at`, e.`finished_at` FROM `review_explanations` e JOIN `chain` c ON c.`id` = e.`id`;--> statement-breakpoint
DROP TABLE `review_explanations`;--> statement-breakpoint
ALTER TABLE `__new_review_explanations` RENAME TO `review_explanations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `review_explanations_ticket_idx` ON `review_explanations` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `review_explanations_review_idx` ON `review_explanations` (`review_id`);--> statement-breakpoint
CREATE INDEX `review_explanations_conversation_idx` ON `review_explanations` (`conversation_id`,`id`);