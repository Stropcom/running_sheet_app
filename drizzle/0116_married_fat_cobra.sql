CREATE TABLE `visitor_team_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') NOT NULL,
	`teamId` int NOT NULL,
	`assignedByCIN` varchar(64) NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `visitor_team_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `visitor_team_user_command_idx` UNIQUE(`userId`,`command`)
);
--> statement-breakpoint
CREATE INDEX `visitor_team_team_idx` ON `visitor_team_assignments` (`teamId`);