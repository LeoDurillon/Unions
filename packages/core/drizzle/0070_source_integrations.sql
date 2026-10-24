CREATE TABLE `integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`kind` text NOT NULL,
	`secret` text NOT NULL,
	`config` text NOT NULL,
	`fields` text,
	`title` text DEFAULT '' NOT NULL,
	`fields_read_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_project_kind_idx` ON `integrations` (`project_id`,`kind`);--> statement-breakpoint
ALTER TABLE `investigations` ADD `ticket_target` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `origin_kind` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `origin_id` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `origin_url` text;--> statement-breakpoint
INSERT INTO `integrations` (`project_id`, `kind`, `secret`, `config`, `fields`, `title`, `fields_read_at`, `created_at`, `updated_at`)
SELECT
	p.`id`,
	'notion',
	p.`notion_token`,
	CASE
		WHEN json_extract(p.`config`, '$.notionDataSourceId') IS NULL THEN json_object()
		ELSE json_object('dataSourceId', json_extract(p.`config`, '$.notionDataSourceId'))
	END,
	CASE
		WHEN n.`project_id` IS NULL THEN NULL
		ELSE json_object('title', n.`title`, 'properties', json(n.`properties`))
	END,
	coalesce(n.`title`, ''),
	n.`fetched_at`,
	p.`created_at`,
	p.`updated_at`
FROM `projects` p
LEFT JOIN `notion_data_sources` n
	ON n.`project_id` = p.`id`
	AND n.`data_source_id` = json_extract(p.`config`, '$.notionDataSourceId')
WHERE p.`notion_token` IS NOT NULL AND p.`notion_token` != '';
--> statement-breakpoint
UPDATE `tickets`
SET
	`origin_kind` = 'notion',
	`origin_id` = `notion_page_id`,
	`origin_url` = 'https://www.notion.so/' || replace(`notion_page_id`, '-', '')
WHERE `notion_page_id` IS NOT NULL AND `notion_page_id` != '';
--> statement-breakpoint
UPDATE `investigations` SET `ticket_target` = 'notion' WHERE `ticket_in_notion` = 1;
