CREATE TABLE `external_background_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityKey` varchar(512) NOT NULL,
	`documentId` int NOT NULL,
	`sectionId` int NOT NULL,
	`attachedByCIN` varchar(64),
	`attachedAt` bigint NOT NULL,
	CONSTRAINT `external_background_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_document_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`heading` varchar(64) NOT NULL,
	`bodyText` text NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `external_document_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attachmentId` int NOT NULL,
	`templateType` varchar(64) NOT NULL DEFAULT 'afp_target_profile',
	`extractedFields` text,
	`ocrText` text,
	`status` enum('pending_review','reviewed') NOT NULL DEFAULT 'pending_review',
	`reviewedByCIN` varchar(64),
	`reviewedAt` bigint,
	`uploadedBy` int NOT NULL,
	`uploadedByCIN` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`deletedAt` bigint,
	`deletedByCIN` varchar(64),
	CONSTRAINT `external_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_entity_mentions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`type` enum('person','vehicle','address','business','phone','email') NOT NULL,
	`entityKey` varchar(512) NOT NULL,
	`label` varchar(512) NOT NULL,
	`matchedExistingKey` varchar(512),
	`status` enum('pending_review','matched','new_entity','rejected') NOT NULL DEFAULT 'pending_review',
	`reviewedByCIN` varchar(64),
	`reviewedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_entity_mentions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `external_background_notes_entityKey_idx` ON `external_background_notes` (`entityKey`);--> statement-breakpoint
CREATE INDEX `external_document_sections_documentId_idx` ON `external_document_sections` (`documentId`);--> statement-breakpoint
CREATE INDEX `external_entity_mentions_documentId_idx` ON `external_entity_mentions` (`documentId`);