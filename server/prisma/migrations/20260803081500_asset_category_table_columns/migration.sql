-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN     "tableColumns" JSONB;

-- Seed Harness's historical column set — every other category (including future ones) keeps the
-- generic default (tableColumns = null). Simplifies the old view's combined "Test 1/2/3" cells
-- into individual date/expiry columns so the mechanism stays fully generic (one column key maps
-- to exactly one fieldKey), reusable by any category.
UPDATE "AssetCategory" SET "tableColumns" = '["nameAndTag","serialNumber",
  "field:id_batch_number","field:test_cert_no","field:tester","notes",
  "field:manufacture_date","field:life_span_expiry_date",
  "field:test_1_test_date","field:test_1_expiry_date",
  "field:test_2_test_date","field:test_2_expiry_date",
  "field:test_3_test_date","field:test_3_expiry_date","field:purchased_from"]'::jsonb
WHERE "name" = 'Harness';
