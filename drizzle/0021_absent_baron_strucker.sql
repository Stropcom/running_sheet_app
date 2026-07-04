CREATE TABLE `wipc_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`targetId` int,
	`detail` varchar(512),
	`ipAddress` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wipc_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wipc_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdBy` int NOT NULL,
	`fullName` text NOT NULL,
	`dob` text,
	`afpId` text NOT NULL,
	`cinNumber` text,
	`aiInitials` text,
	`aiKnownAs` text,
	`isUco` boolean NOT NULL DEFAULT false,
	`isOco` boolean NOT NULL DEFAULT false,
	`isCin` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wipc_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wipc_officer_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fullName` text NOT NULL,
	`afpId` text NOT NULL,
	`workLocation` text,
	`portfolio` text,
	`contactNumber` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wipc_officer_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `wipc_officer_profiles_userId_unique` UNIQUE(`userId`)
);
