CREATE TABLE `operation_shares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operationId` int,
	`fromCommand` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL'),
	`userId` int NOT NULL,
	`level` enum('view','log','manage') NOT NULL,
	`sharedByCIN` varchar(64) NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `operation_shares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` MODIFY COLUMN `action` enum('row_created','row_updated','row_deleted','member_added','member_removed','certified','uncertified','sheet_created','sheet_updated','sheet_deleted','sheet_closed','sheet_reopened','sheet_moved','sheet_copied','user_login','user_logout','user_created','user_updated','user_deleted','user_archived','user_restored','operation_status_changed','operation_updated','operation_shared','operation_share_revoked','password_changed','attachment_added','attachment_deleted','summary_completed','summary_reopened','smeac_briefing_posted','smeac_briefing_deleted','uco_guide_posted','uco_guide_deleted') NOT NULL;--> statement-breakpoint
CREATE INDEX `operation_shares_user_idx` ON `operation_shares` (`userId`);--> statement-breakpoint
CREATE INDEX `operation_shares_operation_idx` ON `operation_shares` (`operationId`);