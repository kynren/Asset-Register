export interface StockItemType {
  id: number;
  name: string;
  code: string;
}

export interface StockTransaction {
  id: number;
  type: "IN" | "OUT";
  quantity: number;
  reason: string | null;
  createdAt: string;
  performedBy: { firstName: string; lastName: string } | null;
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
  transactions?: StockTransaction[];
  createdAt: string;
  updatedAt: string;
}
