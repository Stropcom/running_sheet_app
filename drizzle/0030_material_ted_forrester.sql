CREATE TABLE `rs_mapping_waypoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sheetId` int NOT NULL,
	`rowId` int NOT NULL,
	`lat` double,
	`lng` double,
	`comment` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rs_mapping_waypoints_id` PRIMARY KEY(`id`)
);
