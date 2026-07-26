-- Give objective-question analysis its own model profile while preserving the
-- current programming profile as the upgrade-time starting point.
INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
SELECT 'aiObjectiveProvider', "value", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SystemSetting"
WHERE "key" = 'aiProvider';

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
SELECT 'aiObjectiveBaseUrl', "value", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SystemSetting"
WHERE "key" = 'aiBaseUrl';

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
SELECT 'aiObjectiveModel', "value", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SystemSetting"
WHERE "key" = 'aiModel';

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
SELECT 'aiObjectiveThinkingMode', "value", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SystemSetting"
WHERE "key" = 'aiThinkingMode';

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
SELECT 'aiObjectiveCustomThinkingProtocol', "value", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SystemSetting"
WHERE "key" = 'aiCustomThinkingProtocol';

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiProgrammingStudentCooldownSeconds', '20', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiProgrammingTeacherCooldownSeconds', '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiProgrammingAdminCooldownSeconds', '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveTeacherCooldownSeconds', '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "SystemSetting" ("key", "value", "createdAt", "updatedAt")
VALUES ('aiObjectiveAdminCooldownSeconds', '30', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
