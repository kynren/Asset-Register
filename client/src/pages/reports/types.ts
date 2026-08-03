export interface ReportSummary {
  id: number;
  name: string;
  description: string | null;
  source: string;
  visualization: string;
  isDefault: boolean;
  isOwner: boolean;
  canEdit: boolean;
  ownerName?: string;
  updatedAt: string;
}
