export interface AssetCustomFieldValue {
  id: number;
  fieldId: number;
  value: string | null;
  field: { id: number; fieldKey: string; label: string; fieldType: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX" };
}

export interface Asset {
  id: number;
  assetTag: string;
  name: string;
  status: string;
  signOffStatus: string;
  categoryId: number | null;
  category: { name: string } | null;
  locationId: number | null;
  location: { name: string } | null;
  assignedToId: number | null;
  assignedTo: { id: number; firstName: string; lastName: string } | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  nextServiceDate: string | null;
  notes: string | null;
  device: { lastSeen: string; batteryPresent: boolean | null; batteryPercent: number | null; batteryCharging: boolean | null } | null;
  featuredImageUrl: string | null;
  gridPowered: boolean;
  remoteManagementEnabled: boolean;
  customFieldValues?: AssetCustomFieldValue[];
}
