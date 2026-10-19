CREATE TABLE `passkey_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`type` enum('admin','self') NOT NULL,
	`issuedByCIN` varchar(64),
	`expiresAt` bigint NOT NULL,
	`usedAt` bigint,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `passkey_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `passkey_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`credentialId` varchar(512) NOT NULL,
	`publicKey` text NOT NULL,
	`counter` bigint NOT NULL DEFAULT 0,
	`transports` varchar(255),
	`deviceName` varchar(64) NOT NULL,
	`deviceKind` varchar(16) NOT NULL,
	`createdAt` bigint NOT NULL,
	`lastUsedAt` bigint,
	CONSTRAINT `passkey_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `passkey_credentials_credential_idx` UNIQUE(`credentialId`)
);
--> statement-breakpoint
CREATE TABLE `passkey_settings` (
	`id` int NOT NULL,
	`requireAll` boolean NOT NULL DEFAULT false,
	`maxPasswordSignIns` int NOT NULL DEFAULT 3,
	`updatedByCIN` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `passkey_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` MODIFY COLUMN `action` enum('row_created','row_updated','row_deleted','member_added','member_removed','certified','uncertified','sheet_created','sheet_updated','sheet_deleted','sheet_closed','sheet_reopened','sheet_moved','sheet_copied','user_login','user_logout','user_created','user_updated','user_deleted','user_archived','user_restored','operation_status_changed','operation_updated','operation_shared','operation_share_revoked','password_changed','attachment_added','attachment_deleted','summary_completed','summary_reopened','smeac_briefing_posted','smeac_briefing_deleted','uco_guide_posted','uco_guide_deleted','target_background_updated','command_feature_changed','data_zeroed','passkey_registered','passkey_removed','passkey_login','passkey_code_issued','passkey_code_used','passkey_locked','passkey_settings_changed') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `passkeyPasswordSignIns` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `passkeyLocked` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `passkeyExempt` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `passkey_codes_user_idx` ON `passkey_codes` (`userId`);--> statement-breakpoint
CREATE INDEX `passkey_credentials_user_idx` ON `passkey_credentials` (`userId`);