CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') NOT NULL,
	`name` varchar(64) NOT NULL,
	`colour` varchar(9),
	`aiPhones` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `teams_command_name_idx` UNIQUE(`command`,`name`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `teamId` int;
--> statement-breakpoint
-- Western keeps its three existing teams (and the Crash Helper's AI phones,
-- which were hard-coded per team until now).
INSERT INTO `teams` (`command`, `name`, `colour`, `aiPhones`, `sortOrder`, `createdAt`) VALUES
('WESTERN', 'Team 1', '#ec4899', '["0493 197 381","0494 183 973"]', 1, UNIX_TIMESTAMP() * 1000),
('WESTERN', 'Team 2', '#1976d2', '["0494 155 400","0494 177 049"]', 2, UNIX_TIMESTAMP() * 1000),
('WESTERN', 'PTT', '#f9a825', NULL, 3, UNIX_TIMESTAMP() * 1000);
--> statement-breakpoint
-- Anyone already in a team in another Command gets the same team there, so
-- nobody loses theirs.
INSERT IGNORE INTO `teams` (`command`, `name`, `colour`, `aiPhones`, `sortOrder`, `createdAt`)
SELECT DISTINCT u.`command`,
  CASE u.`team` WHEN 'TEAM1' THEN 'Team 1' WHEN 'TEAM2' THEN 'Team 2' ELSE 'PTT' END,
  CASE u.`team` WHEN 'TEAM1' THEN '#ec4899' WHEN 'TEAM2' THEN '#1976d2' ELSE '#f9a825' END,
  NULL,
  CASE u.`team` WHEN 'TEAM1' THEN 1 WHEN 'TEAM2' THEN 2 ELSE 3 END,
  UNIX_TIMESTAMP() * 1000
FROM `users` u
WHERE u.`team` IS NOT NULL AND u.`command` <> 'WESTERN';
--> statement-breakpoint
UPDATE `users` u
JOIN `teams` t
  ON t.`command` = u.`command`
 AND t.`name` = CASE u.`team` WHEN 'TEAM1' THEN 'Team 1' WHEN 'TEAM2' THEN 'Team 2' ELSE 'PTT' END
SET u.`teamId` = t.`id`
WHERE u.`team` IS NOT NULL;
