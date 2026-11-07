-- Audit log: new actions for Intelligence decisions that change what everyone
-- sees (merge, unmerge, "not the same", a map pin moved, a spelling confirmed or
-- rejected) and for a face "same person" confirmation that relabels photos.
--
-- Safe to run twice: the actions are added only if the last one is not already
-- one of the column's values (appending values to the end of an enum is a
-- metadata-only change). Works on MySQL and MariaDB.
--> statement-breakpoint
SET @ddl = (SELECT IF(INSTR(COLUMN_TYPE, '''face_group_relabelled''') = 0, 'ALTER TABLE `audit_logs` MODIFY COLUMN `action` enum(''row_created'',''row_updated'',''row_deleted'',''member_added'',''member_removed'',''certified'',''uncertified'',''sheet_created'',''sheet_updated'',''sheet_deleted'',''sheet_closed'',''sheet_reopened'',''sheet_moved'',''sheet_copied'',''user_login'',''user_logout'',''user_created'',''user_updated'',''user_deleted'',''user_archived'',''user_restored'',''operation_status_changed'',''operation_updated'',''operation_shared'',''operation_share_revoked'',''password_changed'',''attachment_added'',''attachment_deleted'',''summary_completed'',''summary_reopened'',''smeac_briefing_posted'',''smeac_briefing_deleted'',''uco_guide_posted'',''uco_guide_deleted'',''target_background_updated'',''command_feature_changed'',''data_zeroed'',''passkey_registered'',''passkey_removed'',''passkey_login'',''passkey_code_issued'',''passkey_code_used'',''passkey_locked'',''passkey_settings_changed'',''document_ai_changed'',''place_label_changed'',''predictor_last_seen_changed'',''entity_merged'',''entity_unmerged'',''entity_not_duplicate'',''intel_pin_changed'',''person_name_confirmed'',''person_name_rejected'',''face_group_relabelled'') NOT NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND COLUMN_NAME = 'action');
--> statement-breakpoint
PREPARE stmt FROM @ddl;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
