CREATE TABLE `user_location_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`deviceId` varchar(128) NOT NULL,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`speed` double,
	`heading` double,
	`accuracy` double,
	`operationIds` text NOT NULL DEFAULT ('[]'),
	`recordedAt` bigint NOT NULL,
	CONSTRAINT `user_location_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_location_history_user_recorded` ON `user_location_history` (`userId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `idx_location_history_device_recorded` ON `user_location_history` (`deviceId`,`recordedAt`);