CREATE TABLE `target_document_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetId` int NOT NULL,
	`operationId` int NOT NULL,
	`uploadedByCIN` varchar(64),
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`sourceFileName` varchar(255),
	`snapshotJson` text NOT NULL,
	CONSTRAINT `target_document_imports_id` PRIMARY KEY(`id`)
);
