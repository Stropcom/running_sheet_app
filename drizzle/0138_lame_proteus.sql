-- CTO Weekly Tasking: a day where Surveillance Team 1 and Team 2 work as one
-- blended team. The flag is set on both teams' cells for that day (which hold
-- the same shift and tasks). Default: not blended. Safe to run twice: the column
-- is added only if it is missing.
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `op_manager_tasking_cells` ADD `blended` boolean DEFAULT false NOT NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'op_manager_tasking_cells' AND COLUMN_NAME = 'blended');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
