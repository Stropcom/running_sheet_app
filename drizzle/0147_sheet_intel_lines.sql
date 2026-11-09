-- New Intelligence on the Supervisor Summary: hand-added lines (new table) and
-- the list of automatic lines the supervisor unticked (new column on
-- sheet_summaries).
--
-- Safe to run twice: the table, the column and the index are each created only
-- if missing. Works on MySQL and MariaDB.
CREATE TABLE IF NOT EXISTS `sheet_intel_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sheetId` int NOT NULL,
	`category` varchar(16) NOT NULL,
	`heading` varchar(160) NOT NULL,
	`text` text NOT NULL,
	`time` varchar(32),
	`timeMinutes` int,
	`addedByCIN` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sheet_intel_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `sheet_summaries` ADD `intelHiddenKeys` text', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sheet_summaries' AND COLUMN_NAME = 'intelHiddenKeys');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `sheet_intel_lines_sheet_idx` ON `sheet_intel_lines` (`sheetId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sheet_intel_lines' AND INDEX_NAME = 'sheet_intel_lines_sheet_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
