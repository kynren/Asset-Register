export type AssetCapacityKey = "components" | "contracts" | "documents" | "financialInfo";

export const CAPACITY_INFO: Record<AssetCapacityKey, { label: string; description: string }> = {
  components: { label: "Components", description: "Track internal parts (RAM, storage, peripherals) attached to this asset." },
  contracts: { label: "Contracts", description: "Link maintenance/support contracts to assets in this category." },
  documents: { label: "Documents", description: "Attach files (manuals, certificates, photos) to assets in this category." },
  financialInfo: { label: "Financial & Administrative Info", description: "Show the Supplier, Invoice Number, Purchase Date/Cost, and Warranty fields as their own tab." },
};

export const ALL_CAPACITY_KEYS: AssetCapacityKey[] = ["components", "contracts", "documents", "financialInfo"];

// Category.capacities is `null` for every category that hasn't been explicitly configured — that
// preserves the exact pre-Capacities behavior (Components follows isComputerAsset; Contracts,
// Documents, and Financial Info are always shown) so this feature is 100% opt-in and backward
// compatible. Once an admin saves an explicit list via "Configure Capacities", only the keys in
// that list are shown, regardless of isComputerAsset.
export function hasCapacity(
  category: { capacities?: unknown; isComputerAsset?: boolean } | null | undefined,
  key: AssetCapacityKey
): boolean {
  const capacities = category?.capacities;
  if (Array.isArray(capacities)) return capacities.includes(key);
  if (key === "components") return Boolean(category?.isComputerAsset);
  return true;
}

// The starting point offered when an admin first opts a category into explicit capacity control —
// mirrors what hasCapacity() would already return for that category, so turning on customization
// doesn't silently change what's visible until they actually uncheck something.
export function defaultCapacitiesFor(isComputerAsset: boolean): AssetCapacityKey[] {
  return ALL_CAPACITY_KEYS.filter((key) => (key === "components" ? isComputerAsset : true));
}
