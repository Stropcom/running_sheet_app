CREATE TABLE `operation_target_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operationId` int NOT NULL,
	`targetId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operation_target_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `target_shortcuts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetId` int NOT NULL,
	`trigger` varchar(64) NOT NULL,
	`expansion` text NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `target_shortcuts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `targets` MODIFY COLUMN `operationId` int;--> statement-breakpoint
ALTER TABLE `targets` ADD `hbf` text;--> statement-breakpoint
ALTER TABLE `targets` ADD `v1f` text;--> statement-breakpoint
ALTER TABLE `targets` ADD `v2f` text;--> statement-breakpoint
ALTER TABLE `targets` DROP COLUMN `wb`;