CREATE TABLE `intel_pin_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(512) NOT NULL,
	`lat` double,
	`lng` double,
	`address` varchar(512),
	`markerIcon` varchar(64),
	`markerColour` varchar(32),
	`rotation` int NOT NULL DEFAULT 0,
	`updatedByCIN` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `intel_pin_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `intel_pin_overrides_label_unique` UNIQUE(`label`)
);
