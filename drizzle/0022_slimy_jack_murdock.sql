ALTER TABLE `operations` ADD `deletedAt` bigint;--> statement-breakpoint
ALTER TABLE `operations` ADD `deletedByCIN` varchar(64);--> statement-breakpoint
ALTER TABLE `running_sheets` ADD `deletedAt` bigint;--> statement-breakpoint
ALTER TABLE `running_sheets` ADD `deletedByCIN` varchar(64);--> statement-breakpoint
ALTER TABLE `targets` ADD `deletedAt` bigint;--> statement-breakpoint
ALTER TABLE `targets` ADD `deletedByCIN` varchar(64);