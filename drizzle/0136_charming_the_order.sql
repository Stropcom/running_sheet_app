-- Search: an officer can switch their own track off, so other screens do not
-- draw it (a Search draws everyone's track by itself). Default: shown. Safe to
-- run twice: the column is added only if it is missing.
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `users` ADD `trackHidden` boolean DEFAULT false NOT NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'trackHidden');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
