CREATE TABLE `target_field_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetId` int NOT NULL,
	`fieldName` varchar(32) NOT NULL,
	`previousValue` text NOT NULL,
	`supersededAt` bigint NOT NULL,
	`supersededByCIN` varchar(64),
	CONSTRAINT `target_field_history_id` PRIMARY KEY(`id`)
);
