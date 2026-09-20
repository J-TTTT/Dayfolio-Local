CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`time` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`completed_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_entries_user_date` ON `entries` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_entries_user_completed` ON `entries` (`user_id`,`completed_date`);--> statement-breakpoint
CREATE INDEX `idx_entries_user_kind_date` ON `entries` (`user_id`,`kind`,`date`);