CREATE TABLE `custom_map_markers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdBy` int NOT NULL,
	`operationId` int,
	`targetId` int,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`label` varchar(255),
	`address` varchar(512),
	`markerIcon` varchar(64) NOT NULL,
	`markerColour` varchar(32) NOT NULL,
	`note` text,
	`assocPersons` text,
	`assocVehicles` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_map_markers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_locations` ADD CONSTRAINT `idx_user_device` UNIQUE(`userId`,`deviceId`);