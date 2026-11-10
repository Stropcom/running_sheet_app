ALTER TABLE `shortcuts` ADD `startsRow` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- The two shortcuts the officers added for "on the phone" and "texting" are
-- whole observations about the target: they start their own row. Anything
-- else stays off until an admin turns it on (Shortcuts page).
UPDATE `shortcuts` SET `startsRow` = true WHERE LOWER(`trigger`) IN ('tp', 'text');
