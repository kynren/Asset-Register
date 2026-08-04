-- Per-user appearance: shareable named bundles of color palette + nav layout.
CREATE TABLE "AppearanceTheme" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "navPosition" TEXT NOT NULL DEFAULT 'sidebar',
    "primaryColor" TEXT NOT NULL DEFAULT '#1d4ed8',
    "sidebarBgColor" TEXT,
    "sidebarTextColor" TEXT,
    "pageBgColor" TEXT,
    "isDark" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppearanceTheme_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppearanceTheme_createdById_idx" ON "AppearanceTheme"("createdById");

ALTER TABLE "AppearanceTheme" ADD CONSTRAINT "AppearanceTheme_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AppearanceThemeShare" (
    "id" SERIAL NOT NULL,
    "themeId" INTEGER NOT NULL,
    "sharedWithUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppearanceThemeShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppearanceThemeShare_themeId_sharedWithUserId_key" ON "AppearanceThemeShare"("themeId", "sharedWithUserId");

ALTER TABLE "AppearanceThemeShare" ADD CONSTRAINT "AppearanceThemeShare_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "AppearanceTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppearanceThemeShare" ADD CONSTRAINT "AppearanceThemeShare_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "activeThemeId" INTEGER;
ALTER TABLE "User" ADD CONSTRAINT "User_activeThemeId_fkey" FOREIGN KEY ("activeThemeId") REFERENCES "AppearanceTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
