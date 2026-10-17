ALTER TABLE `current_reviews` ADD `checkout_sha` text;--> statement-breakpoint
ALTER TABLE `current_reviews` ADD `checkout_in_repo` integer DEFAULT false NOT NULL;