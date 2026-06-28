CREATE TABLE `targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operationId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`tgt` text,
	`hb` text,
	`v1` text,
	`v2` text,
	`wb` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `targets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP TABLE `target_profiles`;