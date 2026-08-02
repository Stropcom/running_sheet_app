CREATE TABLE `intelligence_geocode_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`addressKey` varchar(512) NOT NULL,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`resolvedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `intelligence_geocode_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `intelligence_geocode_cache_key_idx` UNIQUE(`addressKey`)
);
