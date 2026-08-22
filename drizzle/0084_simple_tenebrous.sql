ALTER TABLE `stosec_acknowledgements` DROP INDEX `stosec_ack_briefing_user_idx`;--> statement-breakpoint
ALTER TABLE `stosec_acknowledgements` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `stosec_acknowledgements` ADD CONSTRAINT `stosec_ack_briefing_user_rev_idx` UNIQUE(`briefingId`,`userId`,`revision`);