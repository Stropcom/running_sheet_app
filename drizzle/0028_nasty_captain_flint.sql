CREATE TABLE `style_guides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `style_guides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `style_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`guideId` int NOT NULL,
	`ruleType` enum('abbreviation','phrase_required','sentence_start','article_missing','passive_voice','tense','punctuation','capitalisation','custom') NOT NULL,
	`pattern` varchar(512) NOT NULL,
	`description` varchar(512) NOT NULL,
	`suggestion` varchar(512),
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `style_rules_id` PRIMARY KEY(`id`)
);
