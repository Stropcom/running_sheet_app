-- Adds users.chromeStyle: whether the header and left side panel are dark (the
-- original look) or take the palette's light colours in Light mode. Null reads
-- as "dark". See CHROME_STYLES in shared/const.ts.
--
-- Also moves anyone who had picked a palette that has since been removed
-- ("federal-navy", "graphite") onto the default, so no account is left on a
-- theme that no longer exists (the app reads an unknown value as the default
-- anyway; this just keeps the data tidy).
--
-- Adds the column only if it is not already there, so it is safe to run twice
-- and on a database that already has it (MySQL 8 has no ADD COLUMN IF NOT EXISTS).
SET @ddl = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `users` ADD COLUMN `chromeStyle` varchar(16) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'chromeStyle');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
UPDATE `users` SET `colorPalette` = 'steel-blue' WHERE `colorPalette` IN ('federal-navy', 'graphite');
