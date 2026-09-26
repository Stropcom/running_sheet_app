CREATE TABLE `scan_finding_dismissals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ruleId` varchar(64) NOT NULL,
	`findingKey` varchar(255) NOT NULL,
	`dismissedByCIN` varchar(64) NOT NULL,
	`dismissedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scan_finding_dismissals_id` PRIMARY KEY(`id`),
	CONSTRAINT `scan_finding_dismissals_rule_key_idx` UNIQUE(`ruleId`,`findingKey`)
);
