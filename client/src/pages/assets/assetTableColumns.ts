// Generic (non-custom-field) column keys any category's table can show. "asset" is the combined
// name+tag+serial cell used by every category today; the others exist so a customized category
// (see Harness's seeded set) can split that apart or add fields like `notes` that aren't shown by
// default. Custom-field columns are represented separately as `field:<fieldKey>`, resolved live
// against the category's formTemplate.fields rather than hardcoded here.
export const GENERIC_COLUMN_LABELS = {
  asset: "Asset",
  nameAndTag: "Name & Tag",
  serialNumber: "Serial Number",
  notes: "Notes",
  status: "Status",
  location: "Location",
  power: "Power",
  telemetry: "Telemetry",
  custodian: "Custodian",
  signOff: "Sign-off",
} as const;

export type GenericColumnKey = keyof typeof GENERIC_COLUMN_LABELS;

// Behavior-preserving default for every category that hasn't been customized (tableColumns === null).
export const DEFAULT_GENERIC_COLUMNS: string[] = ["asset", "status", "location", "power", "telemetry", "custodian", "signOff"];

export function isGenericColumnKey(key: string): key is GenericColumnKey {
  return Object.prototype.hasOwnProperty.call(GENERIC_COLUMN_LABELS, key);
}

export function fieldKeyFromColumnKey(key: string): string | null {
  return key.startsWith("field:") ? key.slice("field:".length) : null;
}

export function columnKeyForField(fieldKey: string): string {
  return `field:${fieldKey}`;
}
