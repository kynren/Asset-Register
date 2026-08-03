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
  supplier: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  notes: z.string().optional(),
  deviceId: z.number().int().nullable().optional(),
  signOffStatus: z.enum(["PENDING", "CONFIRMED"]).optional(),
  featuredImageUrl: z.string().nullable().optional(),
  gridPowered: z.boolean().optional(),
  remoteManagementEnabled: z.boolean().optional(),
  remoteManagementProtocol: z.string().nullable().optional(),
  remoteManagementUrl: z.string().nullable().optional(),
  staticIpAddress: z.string().nullable().optional(),
  subnetMask: z.string().nullable().optional(),
  defaultGateway: z.string().nullable().optional(),
  dnsServers: z.string().nullable().optional(),
  isVirtual: z.boolean().optional(),
  hypervisor: z.string().nullable().optional(),
  vmHost: z.string().nullable().optional(),
  antivirusProduct: z.string().nullable().optional(),
  antivirusStatus: z.string().nullable().optional(),
  antivirusLastScanAt: z.string().datetime().nullable().optional(),
  customFieldValues: z.array(z.object({ fieldId: z.number().int(), value: z.string().nullable() })).optional(),
});

export const updateAssetSchema = createAssetSchema.partial();

export const checkoutSchema = z.object({
  checkedOutToId: z.number().int(),
  dueBackAt: z.string().datetime().nullable().optional(),
  notes: z.string().optional(),
});

export const checkinSchema = z.object({
  notes: z.string().optional(),
});

export const bulkStatusSchema = z.object({
  assetIds: z.array(z.number().int()).min(1),
  status: assetStatusEnum,
});

export const initPortsSchema = z.object({
  count: z.number().int().min(1).max(96),
});

export const updatePortSchema = z.object({
  label: z.string().nullable().optional(),
  status: z.enum(["UP", "DOWN", "DISABLED"]).optional(),
  vlan: z.string().nullable().optional(),
  connectedAssetId: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});
