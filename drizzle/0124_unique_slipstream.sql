ALTER TABLE `teams` ADD `offerOnNewSheet` boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `teams` SET `offerOnNewSheet` = false WHERE LOWER(`name`) IN ('ptt', 'capability', 'admin', 'administration', 'investigators', 'investigator');
