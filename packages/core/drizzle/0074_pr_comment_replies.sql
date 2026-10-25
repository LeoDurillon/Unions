ALTER TABLE `review_comments` ADD `reply_status` text;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `reply_body` text;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `reply_author` text;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `reply_resolve` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `review_comments` ADD `reply_error` text;