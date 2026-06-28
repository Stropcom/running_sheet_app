CREATE TABLE `shortcuts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trigger` varchar(64) NOT NULL,
	`expansion` text NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shortcuts_id` PRIMARY KEY(`id`),
	CONSTRAINT `shortcuts_trigger_unique` UNIQUE(`trigger`)
);
--> statement-breakpoint
ALTER TABLE `running_sheets` ADD `targetId` int;