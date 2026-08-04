import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { DbFieldInfo, DbModelInfo, findModel, getSchemaRegistry } from "./schemaRegistry";

function requireModel(modelName: string): DbModelInfo {
  const model = findModel(modelName);
  if (!model) throw new ApiError(404, `Unknown table "${modelName}".`);
  return model;
}

// Never let a caller-supplied string reach `(prisma as any)[key]` unless it's a name this exact
// registry (built from the generated client's own DMMF) recognizes — otherwise `:model` is
// effectively arbitrary property access on the Prisma client.
function client(model: DbModelInfo) {
  return (prisma as any)[model.clientKey];
}

function coerceValue(field: DbFieldInfo, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return null;
  switch (field.type) {
    case "Int":
      return typeof raw === "number" ? Math.trunc(raw) : parseInt(String(raw), 10);
    case "Float":
    case "Decimal":
      return typeof raw === "number" ? raw : parseFloat(String(raw));
    case "BigInt":
      return BigInt(raw as any);
    case "Boolean":
      return typeof raw === "boolean" ? raw : raw === "true";
    case "DateTime":
      return new Date(String(raw));
    case "Json":
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    default:
      return String(raw);
  }
}

// Strips any key the caller sent that isn't one of the model's own editable scalar/enum fields
// (relations are never directly settable here — only via their FK scalar, e.g. categoryId), and
// coerces every remaining value to the type Prisma expects for that column.
function sanitizeInput(model: DbModelInfo, body: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of model.fields) {
    if (!field.editable) continue;
    if (!(field.name in body)) continue;
    const raw = body[field.name];
    if (raw === null && !field.isRequired) {
      data[field.name] = null;
      continue;
    }
    if (raw === null || raw === undefined || raw === "") continue; // omit — let DB defaults/required-validation handle it
    data[field.name] = coerceValue(field, raw);
  }
  return data;
}

function buildSearchWhere(model: DbModelInfo, search?: string) {
  const q = search?.trim();
  if (!q) return undefined;
  const stringFields = model.fields.filter((f) => f.kind === "scalar" && f.type === "String");
  if (stringFields.length === 0) return undefined;
  return { OR: stringFields.map((f) => ({ [f.name]: { contains: q, mode: "insensitive" as const } })) };
}

export interface ListRowsParams {
  page: number;
  pageSize: number;
  sortField?: string;
  sortDir?: "asc" | "desc";
  search?: string;
}

export async function listRows(modelName: string, params: ListRowsParams) {
  const model = requireModel(modelName);
  const where = buildSearchWhere(model, params.search);
  const sortField = params.sortField && model.fields.some((f) => f.name === params.sortField && f.kind !== "object") ? params.sortField : model.idField;
  const orderBy = { [sortField]: params.sortDir === "asc" ? "asc" : "desc" };

  const [rows, total] = await Promise.all([
    client(model).findMany({ where, orderBy, skip: (params.page - 1) * params.pageSize, take: params.pageSize }),
    client(model).count({ where }),
  ]);

  return { rows, total, page: params.page, pageSize: params.pageSize, totalPages: Math.max(1, Math.ceil(total / params.pageSize)) };
}

export async function getRow(modelName: string, id: number) {
  const model = requireModel(modelName);
  const row = await client(model).findUnique({ where: { [model.idField]: id } });
  if (!row) throw new ApiError(404, "Record not found");
  return row;
}

// Lightweight {id, label}[] lookup for foreign-key pickers — avoids pulling full row objects
// (which may include large Json/text columns) just to populate a dropdown.
export async function listOptions(modelName: string, search?: string, limit = 200) {
  const model = requireModel(modelName);
  const where = buildSearchWhere(model, search);
  const rows = await client(model).findMany({
    where,
    orderBy: { [model.idField]: "desc" },
    take: limit,
    select: { [model.idField]: true, [model.displayField]: true },
  });
  return rows.map((r: Record<string, unknown>) => ({ id: r[model.idField], label: String(r[model.displayField] ?? r[model.idField]) }));
}

export async function createRow(modelName: string, body: Record<string, unknown>) {
  const model = requireModel(modelName);
  const data = sanitizeInput(model, body);
  return client(model).create({ data });
}

export async function updateRow(modelName: string, id: number, body: Record<string, unknown>) {
  const model = requireModel(modelName);
  const data = sanitizeInput(model, body);
  try {
    return await client(model).update({ where: { [model.idField]: id }, data });
  } catch (err: any) {
    if (err?.code === "P2025") throw new ApiError(404, "Record not found");
    throw err;
  }
}

export async function deleteRow(modelName: string, id: number) {
  const model = requireModel(modelName);
  try {
    await client(model).delete({ where: { [model.idField]: id } });
  } catch (err: any) {
    if (err?.code === "P2025") throw new ApiError(404, "Record not found");
    if (err?.code === "P2003") throw new ApiError(409, "Cannot delete — this record is referenced by other records.");
    throw err;
  }
}

export async function getStats() {
  const { models } = getSchemaRegistry();
  const counts = await Promise.all(
    models.map(async (m) => {
      try {
        return { model: m.name, count: await client(m).count() };
      } catch {
        return { model: m.name, count: null };
      }
    })
  );
  return counts;
}
