CREATE TABLE `sheet_summary_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sheetId` int NOT NULL,
	`rowId` int NOT NULL,
	`text` text NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sheet_summary_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `sheet_summary_entries_row_idx` UNIQUE(`rowId`)
);
--> statement-breakpoint
ALTER TABLE `sheet_summaries` ADD `location` text;--> statement-breakpoint
ALTER TABLE `sheet_summaries` ADD `dismissedVehicleKeys` text;--> statement-breakpoint
ALTER TABLE `sheet_summaries` ADD `ioContactTiming` varchar(64);--> statement-breakpoint
ALTER TABLE `sheet_summaries` ADD `ioContactMethod` varchar(32);