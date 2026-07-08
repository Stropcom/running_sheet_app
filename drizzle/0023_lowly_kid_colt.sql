CREATE TABLE `user_locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`operationIds` text NOT NULL DEFAULT ('[]'),
	`sharingEnabled` boolean NOT NULL DEFAULT false,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `user_locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_locations_userId_unique` UNIQUE(`userId`)
);
