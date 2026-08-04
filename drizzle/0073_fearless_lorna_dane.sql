CREATE TABLE `associates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetId` int NOT NULL,
	`firstNames` varchar(255),
	`surname` varchar(255),
	`bornDate` date,
	`name` varchar(255) NOT NULL,
	`tgt` text,
	`addrUnitNo` varchar(32),
	`addrHouseNo` varchar(32),
	`addrStreetName` varchar(255),
	`addrStreetType` varchar(32),
	`addrSuburb` varchar(255),
	`addrState` varchar(3),
	`hbf` text,
	`hb` text,
	`vehRegistration` varchar(32),
	`vehState` varchar(3),
	`vehColour` varchar(64),
	`vehMake` varchar(64),
	`vehModel` varchar(64),
	`vehType` varchar(32),
	`v1f` text,
	`v1` text,
	`extraVehicles` text,
	`extraAddresses` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` bigint,
	`deletedByCIN` varchar(64),
	CONSTRAINT `associates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `targets` ADD `firstNames` varchar(255);--> statement-breakpoint
ALTER TABLE `targets` ADD `surname` varchar(255);--> statement-breakpoint
ALTER TABLE `targets` ADD `bornDate` date;--> statement-breakpoint
ALTER TABLE `targets` ADD `addrUnitNo` varchar(32);--> statement-breakpoint
ALTER TABLE `targets` ADD `addrHouseNo` varchar(32);--> statement-breakpoint
ALTER TABLE `targets` ADD `addrStreetName` varchar(255);--> statement-breakpoint
ALTER TABLE `targets` ADD `addrStreetType` varchar(32);--> statement-breakpoint
ALTER TABLE `targets` ADD `addrSuburb` varchar(255);--> statement-breakpoint
ALTER TABLE `targets` ADD `addrState` varchar(3);--> statement-breakpoint
ALTER TABLE `targets` ADD `vehRegistration` varchar(32);--> statement-breakpoint
ALTER TABLE `targets` ADD `vehState` varchar(3);--> statement-breakpoint
ALTER TABLE `targets` ADD `vehColour` varchar(64);--> statement-breakpoint
ALTER TABLE `targets` ADD `vehMake` varchar(64);--> statement-breakpoint
ALTER TABLE `targets` ADD `vehModel` varchar(64);--> statement-breakpoint
ALTER TABLE `targets` ADD `vehType` varchar(32);--> statement-breakpoint
ALTER TABLE `targets` ADD `extraAddresses` text;