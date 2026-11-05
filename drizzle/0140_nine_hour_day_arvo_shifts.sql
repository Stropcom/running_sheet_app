-- Day and Arvo shifts (and their on-call versions) are 9 hours.
-- Data only, no schema change. Safe to run twice: after it runs nothing matches.
--
-- 1) CTO Roster: a Day / Day on-call shift that starts at 07:00 now starts at
--    06:00. The code's usual start is now 06:00 (shared/ctoRosterShiftUtils.ts),
--    so the typed start is cleared (no override) and it reads 06:00-15:00.
--    Shifts with no typed start already follow the new default.
UPDATE `cto_roster_shifts`
SET `shiftTime` = NULL
WHERE `shiftCode` IN ('d', 'doc') AND `shiftTime` = '07:00';
--> statement-breakpoint
-- 2) CTO Weekly Tasking: the old 8-hour Day shift 0700-1500 becomes 0600-1500
--    and the old 8-hour Arvo shift 1400-2200 becomes 1300-2200, in every saved
--    week, except where the task is Admin (Admin stays 8 hours, 0700-1500).
--    Any other time is left alone.
UPDATE `op_manager_tasking_cells`
SET `shiftTime` = '0600-1500'
WHERE REPLACE(REPLACE(`shiftTime`, ' ', ''), ':', '') = '0700-1500'
  AND LOWER(TRIM(COALESCE(`primaryTask`, ''))) <> 'admin';
--> statement-breakpoint
UPDATE `op_manager_tasking_cells`
SET `shiftTime` = '1300-2200'
WHERE REPLACE(REPLACE(`shiftTime`, ' ', ''), ':', '') = '1400-2200'
  AND LOWER(TRIM(COALESCE(`primaryTask`, ''))) <> 'admin';
