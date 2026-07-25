CREATE TABLE `entity_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('person','vehicle','address','business') NOT NULL,
	`loserKey` varchar(512) NOT NULL,
	`loserLabel` varchar(512) NOT NULL,
	`winnerKey` varchar(512) NOT NULL,
	`winnerLabel` varchar(512) NOT NULL,
	`mergedByCIN` varchar(64),
	`mergedAt` bigint NOT NULL,
	CONSTRAINT `entity_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `entity_aliases_loser_idx` UNIQUE(`type`,`loserKey`)
);
--> statement-breakpoint
CREATE TABLE `entity_dedup_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('person','vehicle','address','business') NOT NULL,
	`keyA` varchar(512) NOT NULL,
	`keyB` varchar(512) NOT NULL,
	`decidedByCIN` varchar(64),
	`decidedAt` bigint NOT NULL,
	CONSTRAINT `entity_dedup_decisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `entity_dedup_decisions_pair_idx` UNIQUE(`type`,`keyA`,`keyB`)
);
