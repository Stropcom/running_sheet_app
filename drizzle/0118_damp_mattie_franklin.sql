ALTER TABLE `teams` ADD `mapVisibility` enum('always','online') DEFAULT 'always' NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `forceShare` boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `teams` SET `mapVisibility` = 'online' WHERE LOWER(`name`) IN ('admin', 'administration');--> statement-breakpoint
UPDATE `teams` SET `mapVisibility` = 'online', `forceShare` = true WHERE LOWER(`name`) IN ('investigators', 'investigator');
