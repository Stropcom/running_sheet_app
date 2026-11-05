-- Follow-up to 0140 (data only, safe to run twice). Two more old 8-hour shifts
-- that are not Admin become 9 hours, keeping their start: the old Day preset
-- 0600-1400 becomes 0600-1500 and 1300-2100 becomes 1300-2200. Admin cells are
-- left as they are (Admin is 8 hours).
UPDATE `op_manager_tasking_cells`
SET `shiftTime` = '0600-1500'
WHERE REPLACE(REPLACE(`shiftTime`, ' ', ''), ':', '') = '0600-1400'
  AND LOWER(TRIM(COALESCE(`primaryTask`, ''))) <> 'admin';
--> statement-breakpoint
UPDATE `op_manager_tasking_cells`
SET `shiftTime` = '1300-2200'
WHERE REPLACE(REPLACE(`shiftTime`, ' ', ''), ':', '') = '1300-2100'
  AND LOWER(TRIM(COALESCE(`primaryTask`, ''))) <> 'admin';
