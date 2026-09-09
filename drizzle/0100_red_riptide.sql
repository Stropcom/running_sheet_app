ALTER TABLE `users` ADD `pinGender` enum('neutral','male','female') DEFAULT 'neutral' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `pinSkinTone` enum('default','brown') DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `pinVehicleIcon` enum('arrow','car','racing_car','motorcycle','truck','police_car') DEFAULT 'arrow' NOT NULL;