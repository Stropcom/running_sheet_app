CREATE TABLE `command_features` (
	`id` int AUTO_INCREMENT NOT NULL,
	`command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') NOT NULL DEFAULT 'WESTERN',
	`feature` varchar(32) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedByCIN` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `command_features_id` PRIMARY KEY(`id`),
	CONSTRAINT `command_features_cmd_feature_idx` UNIQUE(`command`,`feature`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` MODIFY COLUMN `action` enum('row_created','row_updated','row_deleted','member_added','member_removed','certified','uncertified','sheet_created','sheet_updated','sheet_deleted','sheet_closed','sheet_reopened','sheet_moved','sheet_copied','user_login','user_logout','user_created','user_updated','user_deleted','user_archived','user_restored','operation_status_changed','operation_updated','operation_shared','operation_share_revoked','password_changed','attachment_added','attachment_deleted','summary_completed','summary_reopened','smeac_briefing_posted','smeac_briefing_deleted','uco_guide_posted','uco_guide_deleted','target_background_updated','command_feature_changed') NOT NULL;