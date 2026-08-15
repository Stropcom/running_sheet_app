CREATE TABLE `person_name_match_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetId` int,
	`associateId` int,
	`spelling` varchar(120) NOT NULL,
	`decision` enum('confirmed','rejected') NOT NULL,
	`correctSpelling` varchar(120),
	`decidedByCIN` varchar(64),
	`decidedAt` bigint NOT NULL,
	CONSTRAINT `person_name_match_decisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `person_name_match_target_idx` UNIQUE(`spelling`,`targetId`),
	CONSTRAINT `person_name_match_associate_idx` UNIQUE(`spelling`,`associateId`)
);
