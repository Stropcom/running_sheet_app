-- Search (Target Predictor): the minute the team paused the "how far" ring at,
-- shared with everyone who has the sheet open. Safe to run twice: the column
-- is added only if it is missing.
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `predictor_last_seen` ADD `pausedAtMinutes` int', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'predictor_last_seen' AND COLUMN_NAME = 'pausedAtMinutes');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
