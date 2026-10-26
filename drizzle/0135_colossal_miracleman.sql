-- Search (Target Predictor): when he was last seen and when the rings were
-- paused, to the second (epoch milliseconds), so the rings can grow every 15
-- seconds from the exact moment. Safe to run twice: each column is added only
-- if it is missing.
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `predictor_last_seen` ADD `seenAtMs` bigint', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'predictor_last_seen' AND COLUMN_NAME = 'seenAtMs');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `predictor_last_seen` ADD `pausedAtMs` bigint', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'predictor_last_seen' AND COLUMN_NAME = 'pausedAtMs');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
