CREATE TABLE `agent_tool_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`result_line_id` integer NOT NULL,
	`ticket_id` integer,
	`run_id` integer,
	`investigation_id` integer,
	`session_id` text NOT NULL,
	`tool` text NOT NULL,
	`target` text NOT NULL,
	`variant` text NOT NULL,
	`subagent` integer NOT NULL,
	`calls` integer NOT NULL,
	`errors` integer NOT NULL,
	`denied` integer NOT NULL,
	`result_bytes` integer NOT NULL,
	`at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tool_usage_key_idx` ON `agent_tool_usage` (`result_line_id`,`tool`,`target`,`variant`,`subagent`);--> statement-breakpoint
CREATE INDEX `agent_tool_usage_ticket_idx` ON `agent_tool_usage` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `agent_tool_usage_investigation_idx` ON `agent_tool_usage` (`investigation_id`);