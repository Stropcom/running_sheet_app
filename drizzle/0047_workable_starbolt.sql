ALTER TABLE `attachment_entity_links` MODIFY COLUMN `category` enum('target','vehicle','associate','location','unidentified_person') NOT NULL;--> statement-breakpoint
ALTER TABLE `row_attachments` MODIFY COLUMN `rowId` int;--> statement-breakpoint
ALTER TABLE `row_attachments` ADD `operationId` int;--> statement-breakpoint
ALTER TABLE `row_attachments` ADD `isManualUpload` boolean DEFAULT false NOT NULL;