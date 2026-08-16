ALTER TABLE `governance_records` ADD `savedInInvestigatorTransferDrive` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `governance_records` ADD `savedInInvestigatorTransferDriveCIN` varchar(50);--> statement-breakpoint
ALTER TABLE `governance_records` ADD `savedInInvestigatorTransferDriveName` varchar(100);--> statement-breakpoint
ALTER TABLE `governance_records` DROP COLUMN `savedAsWord`;--> statement-breakpoint
ALTER TABLE `governance_records` DROP COLUMN `savedAsWordCIN`;--> statement-breakpoint
ALTER TABLE `governance_records` DROP COLUMN `savedAsWordName`;--> statement-breakpoint
ALTER TABLE `governance_records` DROP COLUMN `savedAsPdf`;--> statement-breakpoint
ALTER TABLE `governance_records` DROP COLUMN `savedAsPdfCIN`;--> statement-breakpoint
ALTER TABLE `governance_records` DROP COLUMN `savedAsPdfName`;--> statement-breakpoint
ALTER TABLE `governance_records` DROP COLUMN `uploadedToPromis`;--> statement-breakpoint
ALTER TABLE `governance_records` DROP COLUMN `uploadedToPromisCIN`;--> statement-breakpoint
ALTER TABLE `governance_records` DROP COLUMN `uploadedToPromisName`;