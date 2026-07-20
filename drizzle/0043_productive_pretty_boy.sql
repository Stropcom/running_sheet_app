CREATE TABLE `row_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rowId` int NOT NULL,
	`key` varchar(512) NOT NULL,
	`url` varchar(512) NOT NULL,
	`mimeType` varchar(64) NOT NULL,
	`caption` text,
	`uploadedBy` int NOT NULL,
	`uploadedByCIN` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `row_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` MODIFY COLUMN `action` enum('row_created','row_updated','row_deleted','member_added','member_removed','certified','uncertified','sheet_created','sheet_updated','sheet_deleted','sheet_closed','sheet_reopened','sheet_moved','sheet_copied','user_login','user_logout','user_created','user_updated','user_deleted','operation_status_changed','password_changed','attachment_added','attachment_deleted') NOT NULL;