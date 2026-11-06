ALTER TABLE `tickets` ADD `pushed_sha` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `remote_moved` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `resynced_from` text;--> statement-breakpoint
UPDATE `tickets` SET `pushed_sha` = (
  SELECT json_extract(`events`.`payload`, '$.headSha') FROM `events`
  WHERE `events`.`ticket_id` = `tickets`.`id` AND `events`.`type` = 'diff_updated'
  ORDER BY `events`.`seq` DESC LIMIT 1
) WHERE `pr_number` IS NOT NULL;
