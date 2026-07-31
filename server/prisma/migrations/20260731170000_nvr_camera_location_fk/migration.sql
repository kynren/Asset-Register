-- Convert Nvr.location and Camera.location from free-text strings to a proper FK against
-- Location, so the shared Locations list (managed in Admin & Setup) is the single source of
-- truth everywhere a location is picked, matching Asset/StockItem/StockLevel.
ALTER TABLE "Nvr" ADD COLUMN "locationId" INTEGER;
ALTER TABLE "Nvr" DROP COLUMN "location";
ALTER TABLE "Nvr" ADD CONSTRAINT "Nvr_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Camera" ADD COLUMN "locationId" INTEGER;
ALTER TABLE "Camera" DROP COLUMN "location";
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
