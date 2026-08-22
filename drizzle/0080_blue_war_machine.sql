CREATE TABLE `stosec_acknowledgements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`briefingId` int NOT NULL,
	`userId` int NOT NULL,
	`cin` varchar(64) NOT NULL,
	`acknowledgedAt` bigint NOT NULL,
	CONSTRAINT `stosec_acknowledgements_id` PRIMARY KEY(`id`),
	CONSTRAINT `stosec_ack_briefing_user_idx` UNIQUE(`briefingId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `stosec_briefings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operationId` int NOT NULL,
	`sheetId` int,
	`targetId` int,
	`situation` text,
	`mission` text,
	`objectives` text,
	`legalAuthArrest` varchar(255),
	`afpOrders` varchar(255),
	`warrant` varchar(255),
	`commsPrimary` varchar(255),
	`commsSecondary` varchar(255),
	`teamSlots` text,
	`status` enum('draft','posted') NOT NULL DEFAULT 'draft',
	`postedAt` bigint,
	`postedByCIN` varchar(64),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` bigint,
	`deletedByCIN` varchar(64),
	CONSTRAINT `stosec_briefings_id` PRIMARY KEY(`id`)
);
