ALTER TABLE `users` MODIFY COLUMN `role` enum('observer','member','admin','investigator') NOT NULL DEFAULT 'observer';--> statement-breakpoint
ALTER TABLE `users` ADD `investigatorOperationIds` text;