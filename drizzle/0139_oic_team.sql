-- User Management → Teams: every Command gets an "OIC" team (officer in charge),
-- after its other teams, in a dark slate (the colour can be changed there). It is
-- not offered on a new sheet. A Command that already has a team called OIC keeps
-- it as it is. Safe to run twice: the unique (command, name) index makes the
-- second run add nothing.
INSERT IGNORE INTO `teams` (`command`, `name`, `colour`, `aiPhones`, `sortOrder`, `offerOnNewSheet`, `createdAt`)
SELECT c.`command`, 'OIC', '#374151', NULL,
  COALESCE((SELECT MAX(t.`sortOrder`) FROM `teams` t WHERE t.`command` = c.`command`), 0) + 1,
  false,
  UNIX_TIMESTAMP() * 1000
FROM (
  SELECT 'WESTERN' AS `command`
  UNION ALL SELECT 'NORTHERN'
  UNION ALL SELECT 'EASTERN'
  UNION ALL SELECT 'SOUTHERN'
  UNION ALL SELECT 'CENTRAL'
) c;
