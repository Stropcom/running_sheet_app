UPDATE `row_attachments` ra
INNER JOIN `sheet_rows` sr ON ra.`rowId` = sr.`id`
INNER JOIN `running_sheets` rs ON sr.`sheetId` = rs.`id`
SET ra.`operationId` = rs.`operationId`
WHERE ra.`operationId` IS NULL;--> statement-breakpoint
ALTER TABLE `row_attachments` MODIFY COLUMN `operationId` int NOT NULL;