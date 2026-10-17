CREATE TABLE `agent_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`result_line_id` integer NOT NULL,
	`ticket_id` integer,
	`run_id` integer,
	`investigation_id` integer,
	`session_id` text NOT NULL,
	`model` text NOT NULL,
	`main` integer NOT NULL,
	`input` integer NOT NULL,
	`cache_read` integer NOT NULL,
	`cache_write` integer NOT NULL,
	`output` integer NOT NULL,
	`thinking` integer NOT NULL,
	`web_searches` integer NOT NULL,
	`cost_micro_usd` integer,
	`turns` integer,
	`duration_ms` integer,
	`api_duration_ms` integer,
	`peak_context` integer,
	`context_window` integer,
	`failed` integer DEFAULT false NOT NULL,
	`at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_usage_result_idx` ON `agent_usage` (`result_line_id`,`model`);--> statement-breakpoint
CREATE INDEX `agent_usage_ticket_idx` ON `agent_usage` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `agent_usage_run_idx` ON `agent_usage` (`run_id`);--> statement-breakpoint
CREATE INDEX `agent_usage_investigation_idx` ON `agent_usage` (`investigation_id`);--> statement-breakpoint
ALTER TABLE `runs` DROP COLUMN `cost_micro_usd`;