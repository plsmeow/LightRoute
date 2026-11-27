/**
 * db/providers/nodes.ts — Provider nodes CRUD.
 */

import { v4 as uuidv4 } from "uuid";
import { getDbInstance, rowToCamel } from "../core";
import { selectProviderNodeForConnection } from "../providerNodeSelect";
import { backupDbFile } from "../backup";
import { invalidateDbCache } from "../readCache";
import { toRecord, type JsonRecord } from "./columns";
import { resetProviderNodePrefixCache } from "./nodePrefix";

function normalizeDailyQuotaResetHour(value: unknown): number | null {
  return value === 0 || value ? Number(value) : null;
}

function parseStoredJson(storedJson: string | null): unknown {
  if (!storedJson) return null;
  try {
    return JSON.parse(storedJson);
  } catch {
    return null;
  }
}

function withParsedCustomHeaders(node: JsonRecord, storedJson: string | null): JsonRecord {
  const result: JsonRecord = { ...node };
  const headers = parseStoredJson(storedJson) as Record<string, string> | null;
  result.customHeaders = headers;
  result.customUserAgent = headers
    ? (Object.entries(headers).find(([name]) => name.toLowerCase() === "user-agent")?.[1] ?? "")
    : "";
  delete result.customHeadersJson;
  // Custom JSON API node config (#4929 port): exposed parsed, like rowToCamel does.
  result.customJsonConfig = parseStoredJson(
    (result.customJsonConfigJson as string | null | undefined) ?? null
  );
  delete result.customJsonConfigJson;
  return result;
}

/** Stored JSON for a custom JSON API node config; undefined keeps the existing value. */
function customJsonConfigColumn(data: JsonRecord, existing: JsonRecord | null): string | null {
  if (data.customJsonConfig !== undefined) {
    return data.customJsonConfig ? JSON.stringify(data.customJsonConfig) : null;
  }
  const stored = existing?.custom_json_config_json;
  return typeof stored === "string" ? stored : null;
}

interface StatementLike<TRow = unknown> {
  all: (...params: unknown[]) => TRow[];
  get: (...params: unknown[]) => TRow | undefined;
  run: (...params: unknown[]) => { changes?: number };
}

interface DbLike {
  prepare: <TRow = unknown>(sql: string) => StatementLike<TRow>;
}

export async function getProviderNodes(filter: JsonRecord = {}, limit?: number, offset?: number) {
  const db = getDbInstance() as unknown as DbLike;
  let sql = "SELECT * FROM provider_nodes";
  const params: Record<string, unknown> = {};

  if (filter.type) {
    sql += " WHERE type = @type";
    params.type = filter.type;
  }
  sql += " ORDER BY id ASC";
  if (limit !== undefined) {
    sql += " LIMIT @limit OFFSET @offset";
    params.limit = limit;
    params.offset = offset ?? 0;
  }

  return db.prepare(sql).all(params).map(rowToCamel);
}

export function getProviderNodesCount(filter: JsonRecord = {}): number {
  const db = getDbInstance() as unknown as DbLike;
  let sql = "SELECT count(*) as cnt FROM provider_nodes";
  const params: Record<string, unknown> = {};

  if (filter.type) {
    sql += " WHERE type = @type";
    params.type = filter.type;
  }

  const row = db.prepare(sql).get(params) as { cnt: number };
  return row.cnt;
}

export async function getProviderNodeById(id: string) {
  const db = getDbInstance() as unknown as DbLike;
  const row = db.prepare("SELECT * FROM provider_nodes WHERE id = ?").get(id);
  return row ? rowToCamel(row) : null;
}

// #4421: resolve the provider node for a new connection from either its concrete id
// (what the dashboard sends, "<type>-<uuid>") OR the bare derived type (what callers
// using the /api/providers API directly often pass, e.g. "openai-compatible-responses").
// Falls back to the sole node of that type only when unambiguous; otherwise null (so the
// caller still surfaces the existing 404).
export async function resolveProviderNodeForConnection(idOrType: string) {
  const exact = await getProviderNodeById(idOrType);
  if (exact) return exact;
  const all = (await getProviderNodes()) as JsonRecord[];
  return selectProviderNodeForConnection(idOrType, all);
}

export const PROVIDER_NODE_ID_CONFLICT = "PROVIDER_NODE_ID_CONFLICT";

/** Thrown by createProviderNode when a node with the same id already exists. */
export class ProviderNodeIdConflictError extends Error {
  readonly code = PROVIDER_NODE_ID_CONFLICT;
  readonly nodeId: string;

  constructor(nodeId: string) {
    super(`Provider node ID "${nodeId}" already exists`);
    this.name = "ProviderNodeIdConflictError";
    this.nodeId = nodeId;
  }
}

// Matched by `code` (not only `instanceof`) so the guard survives duplicated module
// instances across bundles/realms.
export function isProviderNodeIdConflictError(
  error: unknown
): error is ProviderNodeIdConflictError {
  return (
    error instanceof ProviderNodeIdConflictError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === PROVIDER_NODE_ID_CONFLICT)
  );
}

export async function createProviderNode(data: JsonRecord) {
  const db = getDbInstance() as unknown as DbLike;
  const now = new Date().toISOString();

  const headers: Record<string, string> = data.customHeaders
    ? { ...(data.customHeaders as Record<string, string>) }
    : {};
  if (typeof data.customUserAgent === "string") {
    for (const name in headers) {
      if (name.toLowerCase() === "user-agent") delete headers[name];
    }
    const userAgent = data.customUserAgent.trim();
    if (userAgent) headers["User-Agent"] = userAgent;
  }
  const customHeadersJson = Object.keys(headers).length > 0 ? JSON.stringify(headers) : null;
  const node = {
    id: data.id || uuidv4(),
    type: data.type,
    name: data.name,
    prefix: data.prefix || null,
    apiType: data.apiType || null,
    baseUrl: data.baseUrl || null,
    chatPath: data.chatPath || null,
    modelsPath: data.modelsPath || null,
    // Optional operator-supplied remote icon URL (#2166) — plain TEXT, no JSON parsing needed.
    iconUrl: data.iconUrl || null,
    customHeadersJson,
    customJsonConfigJson: customJsonConfigColumn(data, null),
    dailyQuotaResetTimezone: data.dailyQuotaResetTimezone || null,
    dailyQuotaResetHour: normalizeDailyQuotaResetHour(data.dailyQuotaResetHour),
    createdAt: now,
    updatedAt: now,
  };

  const result = db
    .prepare(
      `
    INSERT INTO provider_nodes (id, type, name, prefix, api_type, base_url, chat_path, models_path, icon_url, custom_headers_json, custom_json_config_json, daily_quota_reset_timezone, daily_quota_reset_hour, created_at, updated_at)
    VALUES (@id, @type, @name, @prefix, @apiType, @baseUrl, @chatPath, @modelsPath, @iconUrl, @customHeadersJson, @customJsonConfigJson, @dailyQuotaResetTimezone, @dailyQuotaResetHour, @createdAt, @updatedAt)
    ON CONFLICT(id) DO NOTHING
  `
    )
    .run(node);
  // Ids can be operator-chosen (custom suffix), so a collision is a caller error,
  // never a silent overwrite nor an unhandled constraint failure.
  if ((result?.changes ?? 0) === 0) throw new ProviderNodeIdConflictError(String(node.id));

  backupDbFile("pre-write");
  invalidateDbCache("nodes");
  resetProviderNodePrefixCache();

  return withParsedCustomHeaders({ ...node }, customHeadersJson);
}

export async function updateProviderNode(id: string, data: JsonRecord) {
  const db = getDbInstance() as unknown as DbLike;
  const existing = db.prepare("SELECT * FROM provider_nodes WHERE id = ?").get(id);
  if (!existing) return null;

  const merged: JsonRecord = {
    ...toRecord(rowToCamel(existing)),
    ...data,
    updatedAt: new Date().toISOString(),
  };

  let headersObj: Record<string, string> = {};
  if (data.customHeaders !== undefined) {
    headersObj = (data.customHeaders as Record<string, string>)
      ? { ...(data.customHeaders as Record<string, string>) }
      : {};
  } else {
    const existingJson = (existing as JsonRecord).custom_headers_json;
    headersObj =
      ((typeof existingJson === "string" ? parseStoredJson(existingJson) : {}) as Record<
        string,
        string
      >) || {};
  }
  if (typeof data.customUserAgent === "string") {
    for (const name in headersObj) {
      if (name.toLowerCase() === "user-agent") delete headersObj[name];
    }
    const userAgent = data.customUserAgent.trim();
    if (userAgent) headersObj["User-Agent"] = userAgent;
    merged["customHeadersJson"] =
      Object.keys(headersObj).length > 0 ? JSON.stringify(headersObj) : null;
  } else if (data.customHeaders !== undefined) {
    merged["customHeadersJson"] =
      Object.keys(headersObj).length > 0 ? JSON.stringify(headersObj) : null;
  } else {
    const existingJson = (existing as JsonRecord).custom_headers_json;
    merged["customHeadersJson"] = typeof existingJson === "string" ? existingJson : null;
  }
  merged["customJsonConfigJson"] = customJsonConfigColumn(data, existing as JsonRecord);
  delete merged["customJsonConfig"];

  db.prepare(
    `
    UPDATE provider_nodes SET type = @type, name = @name, prefix = @prefix,
    api_type = @apiType, base_url = @baseUrl, chat_path = @chatPath,
    models_path = @modelsPath, icon_url = @iconUrl,
    custom_headers_json = @customHeadersJson,
    custom_json_config_json = @customJsonConfigJson,
    daily_quota_reset_timezone = @dailyQuotaResetTimezone,
    daily_quota_reset_hour = @dailyQuotaResetHour,
    updated_at = @updatedAt
    WHERE id = @id
  `
  ).run({
    id,
    type: merged["type"],
    name: merged["name"],
    prefix: merged["prefix"] || null,
    apiType: merged["apiType"] || null,
    baseUrl: merged["baseUrl"] || null,
    chatPath: merged["chatPath"] || null,
    modelsPath: merged["modelsPath"] || null,
    // #2166: iconUrl is nullable — explicit `null` (not omission) clears a previously
    // stored custom icon when the caller submits an empty value.
    iconUrl: merged["iconUrl"] || null,
    customHeadersJson: merged["customHeadersJson"] || null,
    customJsonConfigJson: merged["customJsonConfigJson"],
    dailyQuotaResetTimezone: merged["dailyQuotaResetTimezone"] || null,
    dailyQuotaResetHour: normalizeDailyQuotaResetHour(merged["dailyQuotaResetHour"]),
    updatedAt: merged["updatedAt"],
  });

  backupDbFile("pre-write");
  invalidateDbCache("nodes");
  resetProviderNodePrefixCache();

  return withParsedCustomHeaders(merged, (merged["customHeadersJson"] as string | null) ?? null);
}

export async function deleteProviderNode(id: string) {
  const db = getDbInstance() as unknown as DbLike;
  const existing = db.prepare("SELECT * FROM provider_nodes WHERE id = ?").get(id);
  if (!existing) return null;

  db.prepare("DELETE FROM provider_nodes WHERE id = ?").run(id);
  // A node's custom models live in key_value keyed by the node id; leaving the
  // row behind keeps deleted nodes surfacing models (9router a8f63f4d).
  db.prepare("DELETE FROM key_value WHERE namespace = 'customModels' AND key = ?").run(id);
  backupDbFile("pre-write");
  invalidateDbCache("nodes");
  resetProviderNodePrefixCache();
  return rowToCamel(existing);
}
