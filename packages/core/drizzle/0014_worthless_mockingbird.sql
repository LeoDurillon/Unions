ALTER TABLE `review_comments` ADD `github_comment_id` integer;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `github_url` text;--> statement-breakpoint
CREATE UNIQUE INDEX `review_comments_github_idx` ON `review_comments` (`ticket_id`,`github_comment_id`);