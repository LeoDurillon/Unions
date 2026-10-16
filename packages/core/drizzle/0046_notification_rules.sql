DROP INDEX `notifications_event_idx`;--> statement-breakpoint
ALTER TABLE `notifications` ADD `rule_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_rule_event_idx` ON `notifications` (`rule_id`,`event_seq`) WHERE "notifications"."rule_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_event_idx` ON `notifications` (`event_seq`) WHERE "notifications"."rule_id" is null;