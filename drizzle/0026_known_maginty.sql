ALTER TABLE `custom_map_markers` ADD `rotation` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_map_markers` ADD `deletedAt` bigint;--> statement-breakpoint
ALTER TABLE `custom_map_markers` ADD `deletedByCIN` varchar(32);