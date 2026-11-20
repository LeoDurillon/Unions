ALTER TABLE `agent_usage` ADD `end_context` integer;--> statement-breakpoint
CREATE INDEX `agent_usage_session_idx` ON `agent_usage` (`session_id`,`id`);--> statement-breakpoint
UPDATE `agent_usage` SET `end_context` = (
  SELECT json_extract(l.`payload`, '$.compact_metadata.post_tokens') FROM `agent_log` l
  WHERE l.`ticket_id` = `agent_usage`.`ticket_id`
    AND l.`id` < `agent_usage`.`result_line_id`
    AND json_extract(l.`payload`, '$.subtype') = 'compact_boundary'
    AND json_extract(l.`payload`, '$.session_id') = `agent_usage`.`session_id`
  ORDER BY l.`id` DESC LIMIT 1
) WHERE `main` = 1 AND `peak_context` IS NULL AND `ticket_id` IS NOT NULL;
