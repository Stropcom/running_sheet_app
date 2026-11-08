-- Offline replays are made once: the phone gives each create an id and the
-- server remembers it here, so the same action sent twice (a reply that was
-- lost, a second open tab) returns the record already made.
--
-- Created only if it is not already there, so it is safe to run twice.
-- Works on MySQL and MariaDB.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `offline_action_keys` (
	`actionKey` varchar(120) NOT NULL,
	`kind` varchar(24) NOT NULL,
	`resultId` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `offline_action_keys_actionKey` PRIMARY KEY(`actionKey`)
);
