CREATE TABLE `target_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operationId` int NOT NULL,
	`type` enum('TGT','HB','V1','V2','WB') NOT NULL,
	`field1Label` varchar(128),
	`field1Value` text,
	`field2Label` varchar(128),
	`field2Value` text,
	`field3Label` varchar(128),
	`field3Value` text,
	`field4Label` varchar(128),
	`field4Value` text,
	`field5Label` varchar(128),
	`field5Value` text,
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `target_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `operations` ADD `promisNumber` varchar(128);--> statement-breakpoint
ALTER TABLE `operations` ADD `imsNumber` varchar(128);--> statement-breakpoint
ALTER TABLE `operations` ADD `investigationUnit` varchar(255);--> statement-breakpoint
ALTER TABLE `running_sheets` ADD `targetName` varchar(255);--> statement-breakpoint
ALTER TABLE `running_sheets` ADD `sheetCins` text;--> statement-breakpoint
ALTER TABLE `sheet_rows` ADD `timeMinutes` int;--> statement-breakpoint
ALTER TABLE `operations` DROP COLUMN `description`;--> statement-breakpoint
ALTER TABLE `running_sheets` DROP COLUMN `description`;