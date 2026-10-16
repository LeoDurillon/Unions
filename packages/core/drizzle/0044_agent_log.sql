CREATE TABLE `agent_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`after_seq` integer NOT NULL,
	`ticket_id` integer,
	`run_id` integer,
	`investigation_id` integer,
	`payload` text NOT NULL,
	`at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_log_ticket_idx` ON `agent_log` (`ticket_id`,`id`);--> statement-breakpoint
CREATE INDEX `agent_log_investigation_idx` ON `agent_log` (`investigation_id`,`id`);--> statement-breakpoint
-- Moves the agents' output out of the event log, once. `after_seq` = seq - 1 keeps each line where it
-- was among the events. The only rows ever deleted from `events`: it stays append-only otherwise.
INSERT INTO `agent_log` (`after_seq`, `ticket_id`, `run_id`, `investigation_id`, `payload`, `at`)
SELECT `seq` - 1, `ticket_id`, `run_id`, `investigation_id`, `payload`, `at` FROM `events`
WHERE `type` = 'agent_event' ORDER BY `seq`;
--> statement-breakpoint
DELETE FROM `events` WHERE `type` = 'agent_event';
