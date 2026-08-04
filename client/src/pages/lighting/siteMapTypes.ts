export type SiteMapShapeType = "NONE" | "CIRCLE" | "POLYGON" | "PATH";

export type SiteMapShapeData = { radius: number } | { points: { x: number; y: number }[] } | null;

export interface SiteMapPlacement {
  id: number;
  siteMapId: number;
  deviceId: number;
  x: number;
  y: number;
  shapeType: SiteMapShapeType;
  shapeData: SiteMapShapeData;
  onIcon: string | null;
  offIcon: string | null;
  onColor: string | null;
  offColor: string | null;
  zoneOnColor: string | null;
  device: { id: number; name: string; isOn: boolean; status: string; icon: string | null };
}

export interface SiteMapDetail {
  id: number;
  name: string;
  imageUrl: string;
  sortOrder: number;
  overlayDensity: number;
  devices: SiteMapPlacement[];
}
