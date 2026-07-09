ALTER TABLE `user_locations` DROP INDEX `user_locations_userId_unique`;--> statement-breakpoint
ALTER TABLE `user_locations` ADD `deviceId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `user_locations` ADD `speed` double;--> statement-breakpoint
ALTER TABLE `user_locations` ADD `heading` double;--> statement-breakpoint
ALTER TABLE `user_locations` ADD `accuracy` double;