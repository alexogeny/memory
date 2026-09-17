import { authenticate, login, logout, AuthFailure } from "./auth";

interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Env {
  DB: {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<{ results: Data[] }[]>;
  };
  ASSETS: { fetch(request: Request): Promise<Response> };
  AUTH_USERNAME?: string;
  AUTH_PASSWORD_HASH?: string;
  LOCAL_DEV?: string;
}
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Data = Record<string, any>;
const fields = [
  "subject_id",
  "category",
  "attribute",
  "kind",
  "value",
  "unit",
  "observed_at",
  "valid_from",
  "valid_to",
  "metadata",
];
const recordFields = [
  "id",
  ...fields,
  "revision",
  "created_at",
  "updated_at",
  "retracted_at",
];
const kinds = ["person", "place", "animal", "organization"];
const maxBody = 2_000_000;
const maxRows = 1000;
class Failure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new Failure(status, message);
}
function object(value: unknown): Data {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "Expected a JSON object");
  return value as Data;
}
function exact(value: Data, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    fail(400, "Unknown field");
}
function string(value: unknown, name: string, max: number) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f]/.test(value)
  )
    fail(400, `Invalid ${name}`);
  return value;
}
function identifier(value: unknown) {
  const id = string(value, "id", 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) fail(400, "Invalid id");
  return id;
}
function date(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    fail(400, `Invalid ${name}`);
  return value;
}
function json(value: unknown, depth = 0): asserts value is Json {
  if (depth > 12) fail(400, "Value nesting exceeds 12 levels");
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return;
  if (typeof value !== "object" || value === undefined)
    fail(400, "Invalid JSON value");
  for (const item of Object.values(value)) json(item, depth + 1);
}
function validateRecord(input: Data): Data {
  const subject_id = identifier(input.subject_id);
  const category = string(input.category, "category", 64);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category))
    fail(400, "Category must be a lowercase slug");
  const attribute = string(input.attribute, "attribute", 160).trim();
  if (!["fact", "observation"].includes(input.kind))
    fail(400, "Invalid record kind");
  json(input.value);
  if (JSON.stringify(input.value).length > 16384)
    fail(400, "Value exceeds 16384 characters");
  const metadata = input.metadata === undefined ? {} : input.metadata;
  json(metadata);
  if (JSON.stringify(metadata).length > 16384)
    fail(400, "Metadata exceeds 16384 characters");
  const unit =
    input.unit == null ? null : string(input.unit, "unit", 64).trim();
  const observed_at = date(input.observed_at, "observed_at");
  const valid_from = date(input.valid_from, "valid_from");
  const valid_to = date(input.valid_to, "valid_to");
  if (input.kind === "fact" && observed_at)
    fail(400, "Facts use validity dates, not observed_at");
  if (valid_from && valid_to && Date.parse(valid_from) > Date.parse(valid_to))
    fail(400, "valid_to precedes valid_from");
  return {
    subject_id,
    category,
    attribute,
    kind: input.kind,
    value: input.value,
    unit,
    observed_at,
    valid_from,
    valid_to,
    metadata,
  };
}
function revision(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    fail(400, "Invalid revision");
  return value as number;
}
function decode(row: Data) {
  return {
    ...row,
    value: JSON.parse(row.value),
    metadata: JSON.parse(row.metadata),
  };
}
function history(row: Data) {
  return {
    record_id: row.record_id,
    revision: row.revision,
    operation: row.operation,
    record: JSON.parse(row.snapshot),
    created_at: row.created_at,
  };
}
function insert(db: Env["DB"], record: Data) {
  return db
    .prepare(
      `INSERT INTO records (${recordFields.join(",")}) VALUES (${recordFields.map(() => "?").join(",")})`,
    )
    .bind(
      ...recordFields.map((key) =>
        ["value", "metadata"].includes(key)
          ? JSON.stringify(record[key])
          : record[key],
      ),
    );
}
async function body(request: Request, limit = maxBody) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    fail(415, "Use application/json");
  if (Number(request.headers.get("content-length")) > limit)
    fail(413, `Request exceeds ${limit} bytes`);
  const reader = request.body?.getReader();
  if (!reader) fail(400, "JSON body required");
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      fail(413, `Request exceeds ${limit} bytes`);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return object(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch (error) {
    if (error instanceof Failure || error instanceof AuthFailure) throw error;
    fail(400, "Invalid JSON");
  }
}
function response(value: unknown, status = 200) {
  return Response.json(value, { status });
}
async function api(request: Request, env: Env, username: string) {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method,
    db = env.DB;
  const input = ["POST", "PATCH", "DELETE"].includes(method)
    ? await body(request)
    : undefined;
  if (path === "/api/auth/logout" && method === "POST") { exact(input!, []); return logout(request,env); }
  if (path === "/api/session" && method === "GET") return response({ username });
  if (path === "/api/subjects" && method === "GET")
    return response({
      subjects: (await db.prepare("SELECT * FROM subjects ORDER BY id").all())
        .results,
    });
  if (path === "/api/subjects" && method === "POST") {
    exact(input!, ["name", "kind"]);
    const name = string(input!.name, "name", 160).trim(),
      kind = input!.kind;
    if (!kinds.includes(kind)) fail(400, "Invalid subject kind");
    const subject = { id: crypto.randomUUID(), name, kind };
    await db
      .prepare("INSERT INTO subjects VALUES (?,?,?)")
      .bind(subject.id, name, kind)
      .run();
    return response({ subject }, 201);
  }
  if (path === "/api/records" && method === "GET") {
    const filters = ["retracted_at IS NULL"],
      values: unknown[] = [];
    for (const key of ["subject_id", "category"])
      if (url.searchParams.has(key)) {
        filters.push(`${key} = ?`);
        values.push(string(url.searchParams.get(key), key, 64));
      }
    const q = url.searchParams.get("q");
    if (q) {
      string(q, "query", 200);
      filters.push(
        "(instr(lower(attribute),lower(?)) > 0 OR instr(lower(value),lower(?)) > 0)",
      );
      values.push(q, q);
    }
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      filters.push("id > ?");
      values.push(identifier(cursor));
    }
    const limit = Number(url.searchParams.get("limit") ?? 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      fail(400, "Limit must be 1 to 200");
    const rows = (
      await db
        .prepare(
          `SELECT * FROM records WHERE ${filters.join(" AND ")} ORDER BY id LIMIT ?`,
        )
        .bind(...values, limit + 1)
        .all()
    ).results;
    return response({
      records: rows.slice(0, limit).map(decode),
      next_cursor: rows.length > limit ? rows[limit - 1]!.id : null,
    });
  }
  if (path === "/api/records" && method === "POST") {
    exact(input!, fields);
    const now = new Date().toISOString(),
      record = {
        id: crypto.randomUUID(),
        ...validateRecord(input!),
        revision: 1,
        created_at: now,
        updated_at: now,
        retracted_at: null,
      };
    await insert(db, record).run();
    return response({ record }, 201);
  }
  const match = path.match(/^\/api\/records\/([^/]+)(\/history)?$/);
  if (match) {
    const id = identifier(match[1]);
    if (match[2] && method === "GET")
      return response({
        history: (
          await db
            .prepare(
              "SELECT * FROM record_history WHERE record_id = ? ORDER BY revision DESC",
            )
            .bind(id)
            .all()
        ).results.map(history),
      });
    if (!match[2] && ["PATCH", "DELETE"].includes(method)) {
      exact(
        input!,
        method === "PATCH"
          ? ["expected_revision", ...fields]
          : ["expected_revision"],
      );
      const expected = revision(input!.expected_revision);
      const row = await db
        .prepare("SELECT * FROM records WHERE id = ? AND retracted_at IS NULL")
        .bind(id)
        .first();
      if (!row) fail(404, "Record not found");
      if (row.revision !== expected)
        fail(409, "Record changed; reload before saving");
      const record: Data = {
        ...decode(row),
        ...(method === "PATCH"
          ? validateRecord({ ...decode(row), ...input })
          : {}),
        revision: expected + 1,
        updated_at: new Date().toISOString(),
      };
      if (method === "DELETE") record.retracted_at = record.updated_at;
      const changed = await db
        .prepare(
          `UPDATE records SET ${recordFields
            .filter((key) => key !== "id")
            .map((key) => `${key} = ?`)
            .join(
              ",",
            )} WHERE id = ? AND revision = ? AND retracted_at IS NULL RETURNING *`,
        )
        .bind(
          ...recordFields
            .filter((key) => key !== "id")
            .map((key) =>
              ["value", "metadata"].includes(key)
                ? JSON.stringify(record[key])
                : record[key],
            ),
          id,
          expected,
        )
        .first();
      if (!changed) fail(409, "Record changed; reload before saving");
      return response(
        method === "DELETE" ? { ok: true } : { record: decode(changed) },
      );
    }
  }
  if (path === "/api/export" && method === "GET") {
    const [subjects, records, historyRows] = await db.batch(
      ["subjects", "records", "record_history"].map((table) =>
        db.prepare(`SELECT * FROM ${table} LIMIT ${maxRows + 1}`),
      ),
    );
    if (
      [subjects, records, historyRows].some(
        (result) => result!.results.length > maxRows,
      )
    )
      fail(
        413,
        "Export exceeds the 1000-row limit; contact the owner for a database backup",
      );
    const exported = {
      schema_version: 1,
      exported_at: new Date().toISOString(),
      subjects: subjects!.results,
      records: records!.results.map(decode),
      history: historyRows!.results.map(history),
    };
    const encoded = JSON.stringify(exported);
    if (new TextEncoder().encode(encoded).byteLength > maxBody)
      fail(413, "Export exceeds 2 MB; contact the owner for a database backup");
    return new Response(encoded);
  }
  if (path === "/api/import" && method === "POST")
    return importData(db, input!);
  fail(404, "Not found");
}
function fullRecord(value: unknown): Data {
  const input = object(value);
  exact(input, recordFields);
  const record = {
    id: identifier(input.id),
    ...validateRecord(input),
    revision: revision(input.revision),
    created_at: date(input.created_at, "created_at"),
    updated_at: date(input.updated_at, "updated_at"),
    retracted_at: date(input.retracted_at, "retracted_at"),
  };
  if (
    !record.created_at ||
    !record.updated_at ||
    Date.parse(record.updated_at) < Date.parse(record.created_at)
  )
    fail(400, "Invalid record timestamps");
  return record;
}
async function importData(db: Env["DB"], input: Data) {
  exact(input, [
    "schema_version",
    "exported_at",
    "subjects",
    "records",
    "history",
  ]);
  if (input.schema_version !== 1 || !date(input.exported_at, "exported_at"))
    fail(400, "Unsupported export format");
  for (const key of ["subjects", "records", "history"])
    if (!Array.isArray(input[key]) || input[key].length > maxRows)
      fail(400, "Import arrays must contain at most 1000 rows");
  const subjects: Data[] = input.subjects.map((value: unknown) => {
    const subject = object(value);
    exact(subject, ["id", "name", "kind"]);
    if (!kinds.includes(subject.kind)) fail(400, "Invalid subject kind");
    return {
      id: identifier(subject.id),
      name: string(subject.name, "name", 160).trim(),
      kind: subject.kind,
    };
  });
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  if (subjectIds.size !== subjects.length) fail(400, "Duplicate subject IDs");
  const records: Data[] = input.records.map(fullRecord);
  const byId = new Map(records.map((record) => [record.id, record]));
  if (
    byId.size !== records.length ||
    records.some((record) => !subjectIds.has(record.subject_id))
  )
    fail(400, "Invalid record references");
  const seen = new Set<string>();
  const historyRows: Data[] = input.history.map((value: unknown) => {
    const entry = object(value);
    exact(entry, [
      "record_id",
      "revision",
      "operation",
      "record",
      "created_at",
    ]);
    const record = fullRecord(entry.record),
      record_id = identifier(entry.record_id),
      version = revision(entry.revision);
    const current = byId.get(record_id),
      key = `${record_id}:${version}`;
    if (
      !current ||
      record.id !== record_id ||
      record.revision !== version ||
      version > current.revision ||
      seen.has(key) ||
      !subjectIds.has(record.subject_id)
    )
      fail(400, "Invalid history references");
    if (
      !["create", "update", "retract"].includes(entry.operation) ||
      (version === 1 && entry.operation !== "create") ||
      (entry.operation === "retract") !== (record.retracted_at !== null)
    )
      fail(400, "Invalid history operation");
    if (
      !date(entry.created_at, "history created_at") ||
      entry.created_at !== record.updated_at
    )
      fail(400, "Invalid history timestamp");
    if (
      version === current.revision &&
      JSON.stringify(record) !== JSON.stringify(current)
    )
      fail(400, "Latest history must match the record");
    seen.add(key);
    return { ...entry, record };
  });
  for (const record of records) {
    if (record.revision > maxRows) fail(400, "History exceeds import limit");
    for (let version = 1; version <= record.revision; version++)
      if (!seen.has(`${record.id}:${version}`))
        fail(400, "Record history is incomplete");
  }
  const statements: Statement[] = [];
  for (const subject of subjects) {
    if (subject.id === "self") {
      if (subject.name !== "Me" || subject.kind !== "person")
        fail(400, "The self subject must be Me");
    } else
      statements.push(
        db
          .prepare("INSERT INTO subjects VALUES (?,?,?)")
          .bind(subject.id, subject.name, subject.kind),
      );
  }
  for (const record of records) statements.push(insert(db, record));
  for (const entry of historyRows)
    statements.push(
      db
        .prepare("INSERT OR REPLACE INTO record_history VALUES (?,?,?,?,?)")
        .bind(
          entry.record_id,
          entry.revision,
          entry.operation,
          JSON.stringify(entry.record),
          entry.created_at,
        ),
    );
  if (statements.length) await db.batch(statements);
  return response(
    {
      ok: true,
      imported: {
        subjects: subjects.length,
        records: records.length,
        history: historyRows.length,
      },
    },
    201,
  );
}
function secure(result: Response, apiRequest: boolean) {
  const headers = new Headers(result.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  if (apiRequest)
    headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url),
      apiRequest = url.pathname === "/api" || url.pathname.startsWith("/api/");
    try {
      if (!apiRequest) return secure(await env.ASSETS.fetch(request), false);
      if (
        ["POST", "PATCH", "DELETE", "PUT"].includes(request.method) &&
        request.headers.get("Origin") !== url.origin
      )
        fail(403, "Same-origin request required");
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return secure(await login(request, env, await body(request, 4096)), true);
      }
      const username = await authenticate(request, env);
      return secure(await api(request,env,username),true);
    } catch (error) {
      let status = 500,
        message = "Request could not be completed";
      if (error instanceof Failure || error instanceof AuthFailure) {
        status = error.status;
        message = error.message;
      } else if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      ) {
        status = 409;
        message = "A record or subject already exists";
      } else if (
        error instanceof Error &&
        /FOREIGN KEY constraint failed/.test(error.message)
      ) {
        status = 400;
        message = "Subject does not exist";
      }
      return secure(response({ error: message }, status), true);
    }
  },
};
