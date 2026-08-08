export interface StockItemType {
  id: number;
  name: string;
  code: string;
}

export interface StockTransaction {
  id: number;
  type: "IN" | "OUT" | "TRANSFER";
  quantity: number;
  reason: string | null;
  createdAt: string;
  performedBy: { firstName: string; lastName: string } | null;
  issuance: { id: number; receivedBy: { firstName: string; lastName: string } } | null;
}

export interface StockLevel {
  id: number;
  locationId: number;
  quantityOnHand: number;
  location: { id: number; name: string };
}

export interface StockItemAttachment {
  id: number;
  url: string;
  mimeType: string | null;
  originalName: string | null;
}

export interface StockItem {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  stockItemTypeId: number | null;
  stockItemType: StockItemType | null;
  unit: string;
  quantityOnHand: number;
  reorderLevel: number;
  unitCost: number | null;
  locationId: number | null;
  stockLevels?: StockLevel[];
  attachments?: StockItemAttachment[];
  transactions?: StockTransaction[];
  customColumnValues?: Record<number, string | null>;
  createdAt: string;
  updatedAt: string;
}
