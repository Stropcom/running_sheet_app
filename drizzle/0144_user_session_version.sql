-- Sign-ins that can be ended: each user gets a number that goes up when they log
-- out, change or are given a new password, or are archived. A sign-in carries
-- the number it was issued with; once the number moves on, older sign-ins (a
-- copied cookie, another device) stop working. Everyone starts at 0, and a
-- sign-in without a number counts as 0, so nobody is signed out by this change.
--
-- The column is added only if it is not already there (checked in
-- information_schema; MySQL has no ADD COLUMN IF NOT EXISTS), so it is safe to
-- run twice. Works on MySQL and MariaDB.
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `users` ADD COLUMN `sessionVersion` int NOT NULL DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'sessionVersion');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
