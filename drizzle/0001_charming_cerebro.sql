CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sheetId` int NOT NULL,
	`rowId` int,
	`memberId` int,
	`userId` int NOT NULL,
	`userName` varchar(255) NOT NULL,
	`action` enum('row_created','row_updated','row_deleted','member_added','member_removed','certified','uncertified','sheet_created','sheet_updated','sheet_deleted') NOT NULL,
	`details` text,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `certifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rowId` int NOT NULL,
	`memberId` int NOT NULL,
	`certifiedByUserId` int NOT NULL,
	`certifiedByName` varchar(255) NOT NULL,
	`certifiedAt` bigint NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `certifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `row_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rowId` int NOT NULL,
	`memberName` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `row_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `running_sheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `running_sheets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sheet_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sheetId` int NOT NULL,
	`rowNumber` int NOT NULL,
	`time` varchar(64),
	`observation` text,
	`isLocked` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sheet_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('observer','certifier','admin') NOT NULL DEFAULT 'observer';