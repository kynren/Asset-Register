import { z } from "zod";

export const assetStatusEnum = z.enum(["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"]);

export const createAssetSchema = z.object({
  assetTag: z.string().min(1),
  name: z.string().min(1),
  categoryId: z.number().int().nullable().optional(),
  locationId: z.number().int().nullable().optional(),
  assignedToId: z.number().int().nullable().optional(),
  status: assetStatusEnum.optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  purchaseDate: z.string().datetime().optional().nullable(),
  purchaseCost: z.number().optional().nullable(),
  warrantyExpiresAt: z.string().datetime().optional().nullable(),
  nextServiceDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional(),
  deviceId: z.number().int().nullable().optional(),
  signOffStatus: z.enum(["PENDING", "CONFIRMED"]).optional(),
  featuredImageUrl: z.string().nullable().optional(),
  gridPowered: z.boolean().optional(),
  remoteManagementEnabled: z.boolean().optional(),
  remoteManagementProtocol: z.string().nullable().optional(),
  remoteManagementUrl: z.string().nullable().optional(),
  isVirtual: z.boolean().optional(),
  hypervisor: z.string().nullable().optional(),
  vmHost: z.string().nullable().optional(),
  antivirusProduct: z.string().nullable().optional(),
  antivirusStatus: z.string().nullable().optional(),
  antivirusLastScanAt: z.string().datetime().nullable().optional(),
});

export const updateAssetSchema = createAssetSchema.partial();

export const bulkStatusSchema = z.object({
  assetIds: z.array(z.number().int()).min(1),
  status: assetStatusEnum,
});
