CREATE TABLE `cto_roster_secondments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`destinationTeamId` int NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`createdByCIN` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cto_roster_secondments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cto_roster_secondments_memberId_idx` ON `cto_roster_secondments` (`memberId`);--> statement-breakpoint
CREATE INDEX `cto_roster_secondments_endDate_idx` ON `cto_roster_secondments` (`endDate`);