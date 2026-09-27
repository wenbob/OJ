CREATE TABLE "Announcement" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "title" TEXT NOT NULL CHECK(length("title") BETWEEN 1 AND 100),
  "body" TEXT NOT NULL CHECK(length("body") BETWEEN 1 AND 5000),
  "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt" DATETIME,
  "publisherId" INTEGER,
  "publisherName" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  CONSTRAINT "Announcement_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Announcement_requestId_key" ON "Announcement"("requestId");
CREATE INDEX "Announcement_withdrawnAt_publishedAt_id_idx" ON "Announcement"("withdrawnAt", "publishedAt", "id");
CREATE TABLE "AnnouncementRead" (
  "announcementId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("announcementId", "userId"),
  CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AnnouncementRead_userId_idx" ON "AnnouncementRead"("userId");

