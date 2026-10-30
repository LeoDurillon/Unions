ALTER TABLE `tickets` ADD `github_closed_at` integer;--> statement-breakpoint
-- Tickets cancelled before now keep what they have on GitHub: only a new cancel closes it.
UPDATE `tickets` SET `github_closed_at` = 0 WHERE json_extract(`phase`, '$.kind') = 'cancelled';
