CREATE TABLE `review_specs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer,
	`review_id` integer,
	`kind` text NOT NULL,
	`ref` text,
	`label` text NOT NULL,
	`url` text,
	`text` text,
	`position` integer DEFAULT 0 NOT NULL,
	`removed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_id`) REFERENCES `current_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_specs_ticket_idx` ON `review_specs` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `review_specs_review_idx` ON `review_specs` (`review_id`);--> statement-breakpoint
INSERT INTO `review_specs` (`review_id`, `kind`, `ref`, `label`, `url`, `position`)
SELECT `id`, 'notion', `notion_page_id`, 'Notion: ' || coalesce(`notion_title`, 'Untitled page'), `notion_url`, 1
FROM `current_reviews`
WHERE `notion_page_id` IS NOT NULL;
