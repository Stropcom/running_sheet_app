ALTER TABLE `sheet_summaries` ADD `completedAt` bigint;--> statement-breakpoint
ALTER TABLE `sheet_summaries` ADD `completedByCIN` varchar(64);--> statement-breakpoint
ALTER TABLE `sheet_summaries` ADD `reopenedAt` bigint;--> statement-breakpoint
ALTER TABLE `sheet_summaries` ADD `reopenedByCIN` varchar(64);