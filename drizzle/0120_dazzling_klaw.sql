ALTER TABLE `cto_roster_teams` DROP INDEX `cto_roster_teams_name_unique`;--> statement-breakpoint
ALTER TABLE `op_manager_posted_weeks` DROP INDEX `op_manager_posted_weeks_weekStart_unique`;--> statement-breakpoint
ALTER TABLE `cto_roster_audit_log` ADD `command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') DEFAULT 'WESTERN' NOT NULL;--> statement-breakpoint
ALTER TABLE `cto_roster_drafts` ADD `command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') DEFAULT 'WESTERN' NOT NULL;--> statement-breakpoint
ALTER TABLE `cto_roster_members` ADD `command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') DEFAULT 'WESTERN' NOT NULL;--> statement-breakpoint
ALTER TABLE `cto_roster_outlook_settings` ADD `command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') DEFAULT 'WESTERN' NOT NULL;--> statement-breakpoint
ALTER TABLE `cto_roster_saved_rosters` ADD `command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') DEFAULT 'WESTERN' NOT NULL;--> statement-breakpoint
ALTER TABLE `cto_roster_teams` ADD `command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') DEFAULT 'WESTERN' NOT NULL;--> statement-breakpoint
ALTER TABLE `op_manager_posted_weeks` ADD `command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') DEFAULT 'WESTERN' NOT NULL;--> statement-breakpoint
ALTER TABLE `op_manager_priority_rows` ADD `command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') DEFAULT 'WESTERN' NOT NULL;--> statement-breakpoint
ALTER TABLE `op_manager_supervisor_contacts` ADD `command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') DEFAULT 'WESTERN' NOT NULL;--> statement-breakpoint
ALTER TABLE `op_manager_tasking_cells` ADD `command` enum('WESTERN','NORTHERN','EASTERN','SOUTHERN','CENTRAL') DEFAULT 'WESTERN' NOT NULL;--> statement-breakpoint
ALTER TABLE `cto_roster_outlook_settings` ADD CONSTRAINT `cto_roster_outlook_settings_command_unique` UNIQUE(`command`);--> statement-breakpoint
ALTER TABLE `cto_roster_teams` ADD CONSTRAINT `cto_roster_teams_cmd_name_idx` UNIQUE(`command`,`name`);--> statement-breakpoint
ALTER TABLE `op_manager_posted_weeks` ADD CONSTRAINT `op_manager_posted_weeks_cmd_week_idx` UNIQUE(`command`,`weekStart`);