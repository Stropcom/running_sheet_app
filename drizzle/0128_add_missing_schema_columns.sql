-- Adds the columns that drizzle/schema.ts (and the migration snapshot) already
-- had but that no earlier migration file creates: a database built only from
-- the migrations was missing them, while the live database has them (they were
-- added outside the migration runner). Each column is added ONLY IF it is not
-- there already, so this is a no-op on the live database and fixes a fresh
-- one (a rebuilt server, staging, CI). Works on MySQL and MariaDB (neither
-- needs ADD COLUMN IF NOT EXISTS). scripts/dev/check-schema-drift.ts keeps
-- the two from drifting apart again.
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `associates` ADD COLUMN `relationship` varchar(16) NOT NULL DEFAULT ''associate''', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'associates' AND COLUMN_NAME = 'relationship');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `intel_pin_overrides` ADD COLUMN `customLabel` varchar(255) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intel_pin_overrides' AND COLUMN_NAME = 'customLabel');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `intel_pin_overrides` ADD COLUMN `note` text NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'intel_pin_overrides' AND COLUMN_NAME = 'note');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `map_shapes` ADD COLUMN `rotation` double NOT NULL DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'map_shapes' AND COLUMN_NAME = 'rotation');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `targets` ADD COLUMN `mdlStatus` varchar(16) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'targets' AND COLUMN_NAME = 'mdlStatus');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `targets` ADD COLUMN `bailStatus` varchar(8) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'targets' AND COLUMN_NAME = 'bailStatus');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `targets` ADD COLUMN `bailConditions` varchar(8) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'targets' AND COLUMN_NAME = 'bailConditions');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `targets` ADD COLUMN `bailConditionsText` text NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'targets' AND COLUMN_NAME = 'bailConditionsText');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `targets` ADD COLUMN `specialProjects` text NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'targets' AND COLUMN_NAME = 'specialProjects');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
