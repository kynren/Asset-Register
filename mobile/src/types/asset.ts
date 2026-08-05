export type AssetStatus = "IN_USE" | "IN_STORAGE" | "IN_REPAIR" | "RETIRED" | "LOST";

export interface AssetCategory {
  id: number;
  name: string;
  isComputerAsset?: boolean;
}

export interface AssetLocation {
  id: number;
  name: string;
}

export interface AssetUserRef {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface Asset {
  id: number;
  assetTag: string;
  name: string;
  status: AssetStatus;
  categoryId: number | null;
  category: AssetCategory | null;
  locationId: number | null;
  location: AssetLocation | null;
  assignedToId: number | null;
  assignedTo: AssetUserRef | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  notes: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyExpiresAt: string | null;
  supplier: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const ASSET_STATUS_OPTIONS: { value: AssetStatus; label: string }[] = [
  { value: "IN_USE", label: "In Use" },
  { value: "IN_STORAGE", label: "In Storage" },
  { value: "IN_REPAIR", label: "In Repair" },
  { value: "RETIRED", label: "Retired" },
  { value: "LOST", label: "Lost" },
];
