CREATE TABLE `cto_roster_dismissed_findings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') NOT NULL DEFAULT 'WESTERN',
	`ruleKey` varchar(64) NOT NULL,
	`memberId` int NOT NULL,
	`datesKey` varchar(512) NOT NULL,
	`dismissedByUserId` int,
	`dismissedByName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cto_roster_dismissed_findings_id` PRIMARY KEY(`id`),
	CONSTRAINT `cto_roster_dismissed_findings_key_idx` UNIQUE(`command`,`ruleKey`,`memberId`,`datesKey`)
);
