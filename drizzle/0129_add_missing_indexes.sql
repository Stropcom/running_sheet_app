-- Adds the indexes the busiest tables were missing. Until now sheet_rows,
-- row_members, certifications, row_attachments, running_sheets and others had
-- only their primary key, so every lookup by sheet, row or operation read the
-- whole table and the cost grew with all the data ever recorded (measured: a
-- sheet took 1.7 s to open at 5 years of data, 0.05 s with these indexes; the
-- Governance summary 35 s, now 0.4 s -- docs/features/dev-and-ops.md). Indexes
-- change no results, only how quickly rows are found.
--
-- Each index is created ONLY IF it is not already there (checked in
-- information_schema), so this is safe on a database that already has some of
-- them and on a fresh one; it avoids CREATE INDEX IF NOT EXISTS because MySQL 8
-- does not support it. Works on MySQL and MariaDB.
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `associates_target_idx` ON `associates` (`targetId`,`deletedAt`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'associates' AND INDEX_NAME = 'associates_target_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `attachment_entity_links_category_target_idx` ON `attachment_entity_links` (`category`,`targetId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attachment_entity_links' AND INDEX_NAME = 'attachment_entity_links_category_target_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `attachment_entity_links_category_key_idx` ON `attachment_entity_links` (`category`,`entityKey`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attachment_entity_links' AND INDEX_NAME = 'attachment_entity_links_category_key_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `audit_logs_sheet_idx` ON `audit_logs` (`sheetId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND INDEX_NAME = 'audit_logs_sheet_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`createdAt`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND INDEX_NAME = 'audit_logs_created_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `certifications_row_member_idx` ON `certifications` (`rowId`,`memberId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certifications' AND INDEX_NAME = 'certifications_row_member_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `operation_target_links_target_idx` ON `operation_target_links` (`targetId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_target_links' AND INDEX_NAME = 'operation_target_links_target_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `operation_target_links_operation_idx` ON `operation_target_links` (`operationId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operation_target_links' AND INDEX_NAME = 'operation_target_links_operation_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `person_detections_attachment_idx` ON `person_detections` (`attachmentId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'person_detections' AND INDEX_NAME = 'person_detections_attachment_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `row_attachments_row_idx` ON `row_attachments` (`rowId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'row_attachments' AND INDEX_NAME = 'row_attachments_row_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `row_attachments_operation_idx` ON `row_attachments` (`operationId`,`deletedAt`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'row_attachments' AND INDEX_NAME = 'row_attachments_operation_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `row_members_row_idx` ON `row_members` (`rowId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'row_members' AND INDEX_NAME = 'row_members_row_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `row_members_member_idx` ON `row_members` (`memberName`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'row_members' AND INDEX_NAME = 'row_members_member_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `running_sheets_operation_idx` ON `running_sheets` (`operationId`,`deletedAt`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'running_sheets' AND INDEX_NAME = 'running_sheets_operation_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `running_sheets_target_idx` ON `running_sheets` (`targetId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'running_sheets' AND INDEX_NAME = 'running_sheets_target_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `running_sheets_date_idx` ON `running_sheets` (`sheetDate`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'running_sheets' AND INDEX_NAME = 'running_sheets_date_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `sheet_rows_sheet_row_idx` ON `sheet_rows` (`sheetId`,`rowNumber`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sheet_rows' AND INDEX_NAME = 'sheet_rows_sheet_row_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `sheet_summary_entries_sheet_idx` ON `sheet_summary_entries` (`sheetId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sheet_summary_entries' AND INDEX_NAME = 'sheet_summary_entries_sheet_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @ddl = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `target_field_history_target_idx` ON `target_field_history` (`targetId`)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'target_field_history' AND INDEX_NAME = 'target_field_history_target_idx');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
