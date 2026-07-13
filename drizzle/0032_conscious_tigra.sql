CREATE TABLE `user_sidebar_order` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`orderedKeys` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_sidebar_order_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_sidebar_order_userId_unique` UNIQUE(`userId`)
);
