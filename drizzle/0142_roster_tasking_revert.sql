-- The CTO Weekly Tasking can turn a team's Rest Day or Rest on-call into a
-- working shift on the roster (after the admin says Yes). This column remembers
-- which it was ("r" or "o"), so that if the tasking later has no shift for that
-- team and day the roster can go back to it. Only the tasking sets it; any
-- other write to the shift clears it. Existing rows have none.
--
-- Added only if it is not already there (checked in information_schema; MySQL
-- has no ADD COLUMN IF NOT EXISTS), so it is safe to run on a database that has
-- it. Works on MySQL and MariaDB.
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `cto_roster_shifts` ADD COLUMN `taskingRevert` varchar(8) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cto_roster_shifts' AND COLUMN_NAME = 'taskingRevert');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
