DROP INDEX `review_comments_github_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `review_comments_github_idx` ON `review_comments` (`ticket_id`,`github_url`);--> statement-breakpoint
ALTER TABLE `review_comments` DROP COLUMN `github_comment_id`;