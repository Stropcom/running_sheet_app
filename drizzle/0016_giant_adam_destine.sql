CREATE TABLE `sub_observation_certifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subObsId` int NOT NULL,
	`memberId` int NOT NULL,
	`certifiedByUserId` int NOT NULL,
	`certifiedByName` varchar(255) NOT NULL,
	`certifiedByCIN` varchar(64) NOT NULL,
	`certifiedAt` bigint NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `sub_observation_certifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sub_observation_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subObsId` int NOT NULL,
	`memberName` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sub_observation_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sub_observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rowId` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`observation` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sub_observations_id` PRIMARY KEY(`id`)
);
