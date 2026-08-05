export interface VaultEntry {
  id: number;
  title: string;
  websiteUrl: string | null;
  username: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaultSettings {
  decryptTimeoutSeconds: number;
}
