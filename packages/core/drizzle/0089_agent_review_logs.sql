ALTER TABLE `agent_log` ADD `agent_review_id` integer;--> statement-breakpoint
CREATE INDEX `agent_log_agent_review_idx` ON `agent_log` (`agent_review_id`,`id`);--> statement-breakpoint
ALTER TABLE `agent_usage` ADD `agent_review_id` integer;--> statement-breakpoint
CREATE INDEX `agent_usage_agent_review_idx` ON `agent_usage` (`agent_review_id`);--> statement-breakpoint
ALTER TABLE `agent_tool_usage` ADD `agent_review_id` integer;--> statement-breakpoint
CREATE INDEX `agent_tool_usage_agent_review_idx` ON `agent_tool_usage` (`agent_review_id`);