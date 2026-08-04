// Mirrors server/src/modules/databaseManager/schemaRegistry.ts's shapes exactly — this is what
// /database/schema returns.
export interface DbFieldInfo {
  name: string;
  kind: "scalar" | "object" | "enum";
  type: string;
  isRequired: boolean;
  isUnique: boolean;
  isId: boolean;
  isList: boolean;
  isReadOnly: boolean;
  hasDefaultValue: boolean;
  isUpdatedAt: boolean;
  isForeignKey: boolean;
  relationModel?: string;
  editable: boolean;
}

export interface DbModelInfo {
  name: string;
  clientKey: string;
  fields: DbFieldInfo[];
  idField: string;
  displayField: string;
  sensitive: boolean;
}

export interface DbRelationEdge {
  id: string;
  fromModel: string;
  toModel: string;
  fkField: string;
  relationField: string;
  cardinality: "one-to-many" | "one-to-one";
}

export interface SchemaRegistry {
  models: DbModelInfo[];
  edges: DbRelationEdge[];
  enums: Record<string, string[]>;
}

export interface DbListResult {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Field names that look like they hold secrets — masked as password inputs in the row form even
// though the schema registry doesn't know about them; purely a client-side display convenience.
export const SENSITIVE_FIELD_PATTERN = /password|secret|token|apikey|pinhash/i;
