ALTER TABLE `entries` ADD `project_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `idea_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `progress` integer;--> statement-breakpoint
ALTER TABLE `entries` ADD `problems` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `solution` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `next_steps` text DEFAULT '' NOT NULL;