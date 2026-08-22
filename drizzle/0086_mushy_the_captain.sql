ALTER TABLE `stosec_briefings` ADD `backgroundIntel` text;--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `knownRisks` text;--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `otherAgencies` text;--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `overallPlan` text;--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `actionsOn` text;--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `situationChange` text;--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `accoutrements` text;--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `covertIdentifiers` text;--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `firstAidAllVehicles` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `firstAidMemberName` varchar(255);--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `locationOfTeamLeader` varchar(500);--> statement-breakpoint
ALTER TABLE `stosec_briefings` ADD `reportingProcedures` text;