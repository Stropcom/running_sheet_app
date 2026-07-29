CREATE TABLE `cto_roster_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`userName` varchar(128),
	`action` varchar(64) NOT NULL,
	`memberId` int,
	`memberName` varchar(128),
	`shiftDate` varchar(16),
	`oldValue` text,
	`newValue` text,
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cto_roster_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_draft_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`draftId` int NOT NULL,
	`teamId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `cto_roster_draft_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_draft_shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`draftId` int NOT NULL,
	`memberId` int NOT NULL,
	`shiftDate` date NOT NULL,
	`shiftCode` varchar(8) NOT NULL,
	`shiftTime` varchar(8),
	`comment` text,
	`isActing` boolean NOT NULL DEFAULT false,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_roster_draft_shifts_id` PRIMARY KEY(`id`),
	CONSTRAINT `cto_roster_draft_shifts_draft_member_date_idx` UNIQUE(`draftId`,`memberId`,`shiftDate`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_draft_teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`draftId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `cto_roster_draft_teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`createdBy` int,
	`createdByName` varchar(128),
	`seedSnapshot` text,
	`draftType` enum('seeded','standalone') NOT NULL DEFAULT 'seeded',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_roster_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_eba_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ruleKey` varchar(64) NOT NULL,
	`title` varchar(256) NOT NULL,
	`description` text,
	`eaReference` varchar(64),
	`thresholdValue` int,
	`thresholdValue2` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_roster_eba_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `cto_roster_eba_rules_ruleKey_unique` UNIQUE(`ruleKey`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cin` varchar(64) NOT NULL,
	`teamId` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_roster_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `cto_roster_members_cin_idx` UNIQUE(`cin`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_outlook_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamMinimums` text NOT NULL,
	`onCallMin` int NOT NULL DEFAULT 5,
	`combinedMin` int NOT NULL DEFAULT 5,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_roster_outlook_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_saved_roster_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`savedRosterId` int NOT NULL,
	`teamId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `cto_roster_saved_roster_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_saved_roster_shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`savedRosterId` int NOT NULL,
	`memberId` int NOT NULL,
	`shiftDate` date NOT NULL,
	`shiftCode` varchar(8) NOT NULL,
	`shiftTime` varchar(8),
	`comment` text,
	`isActing` boolean NOT NULL DEFAULT false,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_roster_saved_roster_shifts_id` PRIMARY KEY(`id`),
	CONSTRAINT `cto_roster_saved_roster_shifts_roster_member_date_idx` UNIQUE(`savedRosterId`,`memberId`,`shiftDate`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_saved_roster_teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`savedRosterId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `cto_roster_saved_roster_teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_saved_rosters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`createdBy` int,
	`createdByName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_roster_saved_rosters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`shiftDate` date NOT NULL,
	`shiftCode` varchar(8) NOT NULL,
	`shiftTime` varchar(8),
	`comment` text,
	`isActing` boolean NOT NULL DEFAULT false,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_roster_shifts_id` PRIMARY KEY(`id`),
	CONSTRAINT `cto_roster_shifts_member_date_idx` UNIQUE(`memberId`,`shiftDate`)
);
--> statement-breakpoint
CREATE TABLE `cto_roster_teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `cto_roster_teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `cto_roster_teams_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE INDEX `cto_roster_audit_log_createdAt_idx` ON `cto_roster_audit_log` (`createdAt`);--> statement-breakpoint
CREATE INDEX `cto_roster_audit_log_userId_idx` ON `cto_roster_audit_log` (`userId`);--> statement-breakpoint
CREATE INDEX `cto_roster_draft_members_draftId_idx` ON `cto_roster_draft_members` (`draftId`);--> statement-breakpoint
CREATE INDEX `cto_roster_draft_members_teamId_idx` ON `cto_roster_draft_members` (`teamId`);--> statement-breakpoint
CREATE INDEX `cto_roster_draft_shifts_draftId_idx` ON `cto_roster_draft_shifts` (`draftId`);--> statement-breakpoint
CREATE INDEX `cto_roster_draft_shifts_date_idx` ON `cto_roster_draft_shifts` (`shiftDate`);--> statement-breakpoint
CREATE INDEX `cto_roster_draft_teams_draftId_idx` ON `cto_roster_draft_teams` (`draftId`);--> statement-breakpoint
CREATE INDEX `cto_roster_members_teamId_idx` ON `cto_roster_members` (`teamId`);--> statement-breakpoint
CREATE INDEX `cto_roster_saved_roster_members_rosterId_idx` ON `cto_roster_saved_roster_members` (`savedRosterId`);--> statement-breakpoint
CREATE INDEX `cto_roster_saved_roster_members_teamId_idx` ON `cto_roster_saved_roster_members` (`teamId`);--> statement-breakpoint
CREATE INDEX `cto_roster_saved_roster_shifts_rosterId_idx` ON `cto_roster_saved_roster_shifts` (`savedRosterId`);--> statement-breakpoint
CREATE INDEX `cto_roster_saved_roster_shifts_date_idx` ON `cto_roster_saved_roster_shifts` (`shiftDate`);--> statement-breakpoint
CREATE INDEX `cto_roster_saved_roster_teams_rosterId_idx` ON `cto_roster_saved_roster_teams` (`savedRosterId`);--> statement-breakpoint
CREATE INDEX `cto_roster_shifts_date_idx` ON `cto_roster_shifts` (`shiftDate`);