ALTER TABLE `review_comments` RENAME COLUMN "github_url" TO "source_url";--> statement-breakpoint
DROP INDEX `review_comments_github_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `review_comments_source_idx` ON `review_comments` (`ticket_id`,`source_url`);