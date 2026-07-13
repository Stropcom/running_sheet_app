CREATE TABLE `op_manager_posted_weeks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`weekStart` varchar(10) NOT NULL,
	`postedAt` timestamp NOT NULL DEFAULT (now()),
	`postedBy` int NOT NULL,
	CONSTRAINT `op_manager_posted_weeks_id` PRIMARY KEY(`id`),
	CONSTRAINT `op_manager_posted_weeks_weekStart_unique` UNIQUE(`weekStart`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`)
);
