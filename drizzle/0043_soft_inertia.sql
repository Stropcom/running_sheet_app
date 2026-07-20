CREATE TABLE `row_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rowId` int NOT NULL,
	`key` varchar(512) NOT NULL,
	`url` varchar(512) NOT NULL,
	`mimeType` varchar(64) NOT NULL,
	`caption` text,
	`uploadedBy` int NOT NULL,
	`uploadedByCIN` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `row_attachments_id` PRIMARY KEY(`id`)
);
