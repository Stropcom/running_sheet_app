-- Target Predictor: where the team says the target was last seen, shared with
-- everyone who has the sheet open (one row per running sheet), and a new
-- audit-log action for it.
--
-- Both are safe to run twice: the table is created only if missing, and the
-- audit action is added only if it is not already one of the column's values
-- (appending a value to the end of an enum is a metadata-only change).
CREATE TABLE IF NOT EXISTS `predictor_last_seen` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sheetId` int NOT NULL,
	`targetId` int NOT NULL,
	`dateISO` varchar(10) NOT NULL,
	`kind` varchar(8) NOT NULL,
	`placeKey` varchar(400),
	`lat` double,
	`lng` double,
	`seenMinutes` int,
	`area` varchar(8),
	`updatedByCIN` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `predictor_last_seen_id` PRIMARY KEY(`id`),
	CONSTRAINT `predictor_last_seen_sheet_idx` UNIQUE(`sheetId`)
);
--> statement-breakpoint
SET @ddl = (SELECT IF(INSTR(COLUMN_TYPE, '''predictor_last_seen_changed''') = 0, 'ALTER TABLE `audit_logs` MODIFY COLUMN `action` enum(''row_created'',''row_updated'',''row_deleted'',''member_added'',''member_removed'',''certified'',''uncertified'',''sheet_created'',''sheet_updated'',''sheet_deleted'',''sheet_closed'',''sheet_reopened'',''sheet_moved'',''sheet_copied'',''user_login'',''user_logout'',''user_created'',''user_updated'',''user_deleted'',''user_archived'',''user_restored'',''operation_status_changed'',''operation_updated'',''operation_shared'',''operation_share_revoked'',''password_changed'',''attachment_added'',''attachment_deleted'',''summary_completed'',''summary_reopened'',''smeac_briefing_posted'',''smeac_briefing_deleted'',''uco_guide_posted'',''uco_guide_deleted'',''target_background_updated'',''command_feature_changed'',''data_zeroed'',''passkey_registered'',''passkey_removed'',''passkey_login'',''passkey_code_issued'',''passkey_code_used'',''passkey_locked'',''passkey_settings_changed'',''document_ai_changed'',''place_label_changed'',''predictor_last_seen_changed'') NOT NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND COLUMN_NAME = 'action');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
