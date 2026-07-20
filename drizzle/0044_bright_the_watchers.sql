CREATE TABLE `attachment_entity_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attachmentId` int NOT NULL,
	`category` enum('target','vehicle','associate','location') NOT NULL,
	`targetId` int,
	`entityKey` varchar(512),
	`entityLabel` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attachment_entity_links_id` PRIMARY KEY(`id`)
);
