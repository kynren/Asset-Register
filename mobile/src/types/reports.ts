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
}

export type ReportResult =
  | { kind: "table"; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: "chart"; data: { label: string; count: number }[] }
  | { kind: "kpi"; value: number };
