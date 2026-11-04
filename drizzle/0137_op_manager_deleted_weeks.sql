-- Recycle Bin for the CTO Weekly Tasking: a deleted week is kept here for the
-- Recycle Bin's 7 days (a JSON snapshot of its contacts, priority board,
-- calendar and posted marker) so it can be reinstated. Safe to run twice: the
-- table (and its index) are created only if missing.
CREATE TABLE IF NOT EXISTS `op_manager_deleted_weeks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') NOT NULL DEFAULT 'WESTERN',
	`weekStart` varchar(10) NOT NULL,
	`snapshot` longtext NOT NULL,
	`deletedAt` bigint NOT NULL,
	`deletedByCIN` varchar(32),
	CONSTRAINT `op_manager_deleted_weeks_id` PRIMARY KEY(`id`),
	KEY `op_manager_deleted_weeks_cmd_deleted_idx` (`command`,`deletedAt`)
);
