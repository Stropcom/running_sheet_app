CREATE TABLE `face_match_dismissals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityLinkIdA` int NOT NULL,
	`entityLinkIdB` int NOT NULL,
	`dismissedByCIN` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `face_match_dismissals_id` PRIMARY KEY(`id`)
);
