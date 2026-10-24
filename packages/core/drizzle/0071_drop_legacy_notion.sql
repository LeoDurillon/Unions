DROP TABLE `notion_data_sources`;--> statement-breakpoint
ALTER TABLE `investigations` DROP COLUMN `ticket_in_notion`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `notion_token`;--> statement-breakpoint
ALTER TABLE `tickets` DROP COLUMN `notion_page_id`;--> statement-breakpoint
UPDATE `projects` SET `config` = json_remove(`config`, '$.notionDataSourceId') WHERE json_extract(`config`, '$.notionDataSourceId') IS NOT NULL;
