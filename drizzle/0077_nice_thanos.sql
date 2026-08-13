CREATE TABLE `wipc_vault_key_check` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyFingerprint` varchar(64) NOT NULL,
	`canaryValue` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wipc_vault_key_check_id` PRIMARY KEY(`id`)
);
