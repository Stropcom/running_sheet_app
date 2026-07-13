CREATE TABLE `op_manager_priority_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`weekStart` varchar(10) NOT NULL,
	`category` varchar(64) NOT NULL,
	`priority` int NOT NULL,
	`operationId` int,
	`operationName` varchar(255),
	`team` varchar(64),
	`requestType` varchar(128),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `op_manager_priority_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `op_manager_supervisor_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`weekStart` varchar(10) NOT NULL,
	`role` varchar(128) NOT NULL,
	`userId` int,
	`customName` varchar(255),
	`phone` varchar(32),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `op_manager_supervisor_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `op_manager_tasking_cells` (
	`id` int AUTO_INCREMENT NOT NULL,
	`weekStart` varchar(10) NOT NULL,
	`dayIndex` int NOT NULL,
	`teamRow` varchar(64) NOT NULL,
	`shiftTime` varchar(32),
	`primaryTask` varchar(255),
	`secondaryTask` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `op_manager_tasking_cells_id` PRIMARY KEY(`id`)
);
