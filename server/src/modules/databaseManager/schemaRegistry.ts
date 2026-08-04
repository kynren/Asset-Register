// Builds a runtime registry of every Prisma model, its fields, and its relations from
// `Prisma.dmmf` — the same metadata Prisma itself generates the client from. This is what lets
// the Database Manager browse/edit all ~137 models generically instead of hand-coding each one.
// Built once at module load (DMMF is static for a given generated client) and cached.
import { Prisma } from "@prisma/client";

export interface DbFieldInfo {
  name: string;
  kind: "scalar" | "object" | "enum";
  type: string; // e.g. "String", "Int", "DateTime", "Boolean", "Float", "Json", or a model/enum name
  isRequired: boolean;
  isUnique: boolean;
  isId: boolean;
  isList: boolean;
  isReadOnly: boolean;
  hasDefaultValue: boolean;
  isUpdatedAt: boolean;
  /** Populated only for kind="scalar" fields that are the FK column of an owning relation (e.g. "categoryId"). */
  isForeignKey: boolean;
  relationModel?: string;
  /** True for fields the generic create/update form should never send (id, createdAt, updatedAt). */
  editable: boolean;
}

export interface DbModelInfo {
  name: string; // PascalCase Prisma model name
  clientKey: string; // camelCase property on the Prisma client, e.g. prisma[clientKey]
  fields: DbFieldInfo[];
  idField: string;
  /** Best-guess human-readable field for picker labels — "name"/"title"/etc, falling back to id. */
  displayField: string;
  /** Models holding especially sensitive data — browsing/editing still allowed (System Admin has
   *  full platform trust) but the frontend shows a warning badge before edit/delete. */
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

const SENSITIVE_MODELS = new Set([
  "RefreshSession",
  "PasswordResetToken",
  "MagicLoginToken",
  "PasswordHistory",
  "VaultEntry",
  "AgentApiKey",
  "McpApiKey",
]);

const DISPLAY_FIELD_PRIORITY = ["name", "title", "label", "email", "username", "fileName", "originalName", "filename", "subject"];

function toClientKey(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function buildRegistry(): SchemaRegistry {
  const dmmfModels = Prisma.dmmf.datamodel.models;
  const enums: Record<string, string[]> = {};
  for (const e of Prisma.dmmf.datamodel.enums) {
    enums[e.name] = e.values.map((v) => v.name);
  }

  const edges: DbRelationEdge[] = [];
  const models: DbModelInfo[] = [];

  for (const m of dmmfModels) {
    const idFieldRaw = m.fields.find((f) => f.isId);
    if (!idFieldRaw) continue; // every model in this schema has a single `id` PK; skip anything that doesn't (defensive)

    // FK scalar fields are named by the owning relation field's `relationFromFields` — collect
    // them first so the field loop below can flag `isForeignKey`/`relationModel`.
    const fkFieldNames = new Map<string, string>(); // scalar field name -> related model name
    for (const f of m.fields) {
      if (f.kind === "object" && f.relationFromFields && f.relationFromFields.length > 0) {
        const fkField = f.relationFromFields[0];
        fkFieldNames.set(fkField, f.type);
        const fkScalar = m.fields.find((sf) => sf.name === fkField);
        edges.push({
          id: `${m.name}.${f.name}`,
          fromModel: m.name,
          toModel: f.type,
          fkField,
          relationField: f.name,
          cardinality: fkScalar?.isUnique ? "one-to-one" : "one-to-many",
        });
      }
    }

    const fields: DbFieldInfo[] = m.fields
      .filter((f) => f.kind !== "object") // relation object fields aren't directly editable/displayable — only their FK scalar is
      .map((f) => {
        const isForeignKey = fkFieldNames.has(f.name);
        const editable = !f.isId && !f.isUpdatedAt && f.name !== "createdAt";
        return {
          name: f.name,
          kind: f.kind as "scalar" | "enum",
          type: f.type,
          isRequired: f.isRequired,
          isUnique: f.isUnique,
          isId: f.isId,
          isList: f.isList,
          isReadOnly: f.isReadOnly,
          hasDefaultValue: f.hasDefaultValue,
          isUpdatedAt: f.isUpdatedAt ?? false,
          isForeignKey,
          relationModel: isForeignKey ? fkFieldNames.get(f.name) : undefined,
          editable,
        };
      });

    const displayField = DISPLAY_FIELD_PRIORITY.find((n) => fields.some((f) => f.name === n && f.type === "String")) ?? idFieldRaw.name;

    models.push({
      name: m.name,
      clientKey: toClientKey(m.name),
      fields,
      idField: idFieldRaw.name,
      displayField,
      sensitive: SENSITIVE_MODELS.has(m.name),
    });
  }

  models.sort((a, b) => a.name.localeCompare(b.name));

  return { models, edges, enums };
}

let cached: SchemaRegistry | null = null;

export function getSchemaRegistry(): SchemaRegistry {
  if (!cached) cached = buildRegistry();
  return cached;
}

export function findModel(name: string): DbModelInfo | undefined {
  const registry = getSchemaRegistry();
  const lower = name.toLowerCase();
  return registry.models.find((m) => m.name.toLowerCase() === lower);
}
