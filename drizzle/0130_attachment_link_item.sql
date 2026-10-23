-- Adds "item" to the kinds of link a photo can have (attachment_entity_links.
-- category): a photo of a thing (a bag, a phone) described in a few words, that
-- is not an Intelligence entity. See shared/attachmentLinking.ts.
--
-- Changes the column only if "item" is not already one of its values, so it is
-- safe on a database that already has it. Appending a value at the end of an
-- enum is a metadata-only change on MySQL 8 and MariaDB (no table rebuild).
SET @ddl = (SELECT IF(INSTR(COLUMN_TYPE, '''item''') = 0, 'ALTER TABLE `attachment_entity_links` MODIFY COLUMN `category` enum(''target'',''vehicle'',''associate'',''location'',''unidentified_person'',''member'',''item'') NOT NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attachment_entity_links' AND COLUMN_NAME = 'category');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
