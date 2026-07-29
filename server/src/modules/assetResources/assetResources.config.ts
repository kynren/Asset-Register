import { z } from "zod";

export type ResourceModel =
  | "assetPhoto"
  | "assetComponent"
  | "assetVolume"
  | "assetConnection"
  | "assetNetworkPort"
  | "assetSocket"
  | "assetContract"
  | "assetDocument";

export interface ResourceConfig {
  model: ResourceModel;
  isFile: boolean;
  fileOptional?: boolean;
  urlField?: "url" | "fileUrl";
  schema: z.ZodTypeAny;
}

export const RESOURCE_CONFIG: Record<string, ResourceConfig> = {
  photos: {
    model: "assetPhoto",
    isFile: true,
    urlField: "url",
    schema: z.object({}),
  },
  components: {
    model: "assetComponent",
    isFile: false,
    schema: z.object({
      type: z.string().min(1),
      name: z.string().min(1),
      details: z.string().optional(),
    }),
  },
  volumes: {
    model: "assetVolume",
    isFile: false,
    schema: z.object({
      label: z.string().min(1),
      totalGb: z.number().optional(),
      freeGb: z.number().optional(),
      fileSystem: z.string().optional(),
    }),
  },
  connections: {
    model: "assetConnection",
    isFile: false,
    schema: z.object({
      label: z.string().min(1),
      type: z.string().optional(),
      target: z.string().optional(),
    }),
  },
  "network-ports": {
    model: "assetNetworkPort",
    isFile: false,
    schema: z.object({
      portNumber: z.number().int(),
      protocol: z.string().optional(),
      serviceName: z.string().optional(),
      status: z.string().optional(),
    }),
  },
  sockets: {
    model: "assetSocket",
    isFile: false,
    schema: z.object({
      label: z.string().min(1),
      type: z.string().optional(),
      location: z.string().optional(),
    }),
  },
  contracts: {
    model: "assetContract",
    isFile: true,
    fileOptional: true,
    urlField: "fileUrl",
    schema: z.object({
      vendor: z.string().min(1),
      contractNumber: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      notes: z.string().optional(),
    }),
  },
  documents: {
    model: "assetDocument",
    isFile: true,
    urlField: "fileUrl",
    schema: z.object({
      name: z.string().min(1),
    }),
  },
};
