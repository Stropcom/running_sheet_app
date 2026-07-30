ALTER TABLE `notifications` ADD `meta` text;--> statement-breakpoint
ALTER TABLE `users` ADD `rosterShiftNotificationsEnabled` boolean DEFAULT true NOT NULL;