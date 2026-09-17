import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import worker, { type Env } from "../worker/index";

let sqlite: Database;
let env: Env;
class Statement {
  values: unknown[] = [];
  constructor(readonly sql: string) {}
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  async first() {
    return sqlite.query(this.sql).get(...(this.values as any[])) ?? null;
  }
  async all() {
    return { results: sqlite.query(this.sql).all(...(this.values as any[])) };
  }
  async run() {
    return { meta: sqlite.query(this.sql).run(...(this.values as any[])) };
  }
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  overrides: Partial<Env> = {},
  headers: Record<string, string> = {},
) {
  const response = await worker.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { ...env, ...overrides },
  );
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as any,
  };
}
const fact = {
  subject_id: "self",
  category: "clothing",
  attribute: "shirt size",
  kind: "fact",
  value: "M",
  unit: null,
  observed_at: null,
  valid_from: null,
  valid_to: null,
};
beforeEach(async () => {
  sqlite = new Database(":memory:");
  sqlite.exec(
    await Bun.file(new URL("../migrations/0001.sql", import.meta.url)).text(),
  );
  env = {
    LOCAL_DEV: "true",
    DB: {
      prepare: (sql: string) => new Statement(sql),
      batch: async (statements: Statement[]) =>
        sqlite.transaction(() =>
          statements.map((s) => ({
            results: sqlite.query(s.sql).all(...(s.values as any[])),
          })),
        )(),
    } as any,
    ASSETS: { fetch: async () => new Response("asset") },
  };
});
afterEach(() => sqlite.close());
describe("private records API", () => {
  test("fails closed without Access config, rejects invalid tokens and cross-origin writes", async () => {
    expect(
      (
        await request("/api/session", "GET", undefined, {
          LOCAL_DEV: undefined,
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await request("/api/session", "GET", undefined, {
          LOCAL_DEV: undefined,
          ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
          ACCESS_AUD: "aud",
          ALLOWED_EMAIL: "me@example.com",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "/api/records",
          "POST",
          fact,
          {},
          { Origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    const response = await worker.fetch(
      new Request("https://memory.example/api/session"),
      env,
    );
    expect(response.status).toBe(503);
  });
  test("validates inputs and enforces unique active facts", async () => {
    expect(
      (await request("/api/records", "POST", { ...fact, category: "../bad" }))
        .status,
    ).toBe(400);
    expect(
      (
        await request("/api/records", "POST", {
          ...fact,
          observed_at: "yesterday",
        })
      ).status,
    ).toBe(400);
    expect((await request("/api/records", "POST", fact)).status).toBe(201);
    expect((await request("/api/records", "POST", fact)).status).toBe(409);
    expect((await request("/api/records")).body.records).toHaveLength(1);
  });
  test("updates with revision checks, records history and retracts", async () => {
    const created = (await request("/api/records", "POST", fact)).body.record;
    expect(created.revision).toBe(1);
    expect(
      (
        await request(`/api/records/${created.id}`, "PATCH", {
          expected_revision: 1,
          value: "L",
        })
      ).body.record.revision,
    ).toBe(2);
    expect(
      (
        await request(`/api/records/${created.id}`, "PATCH", {
          expected_revision: 1,
          value: "S",
        })
      ).status,
    ).toBe(409);
    expect(
      (await request(`/api/records/${created.id}/history`)).body.history,
    ).toHaveLength(2);
    expect(
      (
        await request(`/api/records/${created.id}`, "DELETE", {
          expected_revision: 2,
        })
      ).status,
    ).toBe(200);
    expect((await request("/api/records")).body.records).toHaveLength(0);
    expect(
      (await request(`/api/records/${created.id}/history`)).body.history,
    ).toHaveLength(3);
    expect((await request("/api/records", "POST", fact)).status).toBe(201);
  });
  test("supports dated observations, subjects, search and pagination", async () => {
    const subject = (
      await request("/api/subjects", "POST", { name: "Milo", kind: "animal" })
    ).body.subject;
    expect(
      (
        await request("/api/records", "POST", {
          ...fact,
          subject_id: subject.id,
          kind: "observation",
        })
      ).status,
    ).toBe(201);
    for (const date of ["2026-09-01", "2026-09-02"])
      expect(
        (
          await request("/api/records", "POST", {
            ...fact,
            subject_id: subject.id,
            kind: "observation",
            observed_at: date,
          })
        ).status,
      ).toBe(201);
    const first = (
      await request(`/api/records?subject_id=${subject.id}&limit=1&q=shirt`)
    ).body;
    expect(first.records).toHaveLength(1);
    expect(first.next_cursor).toBeString();
    expect(
      (
        await request(
          `/api/records?subject_id=${subject.id}&limit=1&q=shirt&cursor=${encodeURIComponent(first.next_cursor)}`,
        )
      ).body.records,
    ).toHaveLength(1);
  });
  test("exports and imports atomically without overwriting existing IDs", async () => {
    const created = (await request("/api/records", "POST", fact)).body.record;
    await request(`/api/records/${created.id}`, "PATCH", {
      expected_revision: 1,
      value: "XL",
    });
    const exported = (await request("/api/export")).body;
    expect(exported.schema_version).toBe(1);
    expect(exported.history).toHaveLength(2);
    expect((await request("/api/import", "POST", exported)).status).toBe(409);
    sqlite.exec("DELETE FROM record_history; DELETE FROM records;");
    expect((await request("/api/import", "POST", exported)).status).toBe(201);
    expect((await request("/api/records")).body.records[0].value).toBe("XL");
    expect(
      (await request(`/api/records/${created.id}/history`)).body.history,
    ).toHaveLength(2);
    const bad = {
      ...exported,
      records: [
        {
          ...exported.records[0],
          id: crypto.randomUUID(),
          subject_id: "missing",
        },
      ],
    };
    expect((await request("/api/import", "POST", bad)).status).toBe(400);
    expect((await request("/api/records")).body.records).toHaveLength(1);
  });
});

test("rejects malformed tokens, non-JSON bodies and oversized values; protects assets", async () => {
  const production = {
    LOCAL_DEV: undefined,
    ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    ALLOWED_EMAIL: "me@example.com",
  };
  expect(
    (
      await request("/api/session", "GET", undefined, production, {
        "Cf-Access-Jwt-Assertion": "not-a-jwt",
      })
    ).status,
  ).toBe(401);
  const asset = await worker.fetch(new Request("https://memory.example/"), {
    ...env,
    ...production,
  });
  expect(asset.status).toBe(401);
  expect(asset.headers.get("Cache-Control")).toBe("no-store");
  expect(
    (
      await request(
        "/api/records",
        "POST",
        fact,
        {},
        { "Content-Type": "text/plain" },
      )
    ).status,
  ).toBe(415);
  expect(
    (
      await request("/api/records", "POST", {
        ...fact,
        value: "x".repeat(16385),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request("/api/records", "POST", {
        ...fact,
        valid_from: "2026-09-20",
        valid_to: "2026-09-10",
      })
    ).status,
  ).toBe(400);
  const malformed = await worker.fetch(
    new Request("http://localhost/api/records", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: "{",
    }),
    env,
  );
  expect(malformed.status).toBe(400);
});

test("import rolls back new subjects when an existing record conflicts", async () => {
  await request("/api/records", "POST", fact);
  const exported = (await request("/api/export")).body;
  exported.subjects.push({
    id: "new-person",
    name: "New person",
    kind: "person",
  });
  expect((await request("/api/import", "POST", exported)).status).toBe(409);
  expect((await request("/api/subjects")).body.subjects).toHaveLength(1);
  exported.history = [];
  expect((await request("/api/import", "POST", exported)).status).toBe(400);
});

test("verifies signature, issuer, audience, expiry and exact allowed email", async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import("jose");
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const key = {
    ...(await exportJWK(publicKey)),
    kid: "test-key",
    alg: "RS256",
    use: "sig",
  };
  const production = {
    LOCAL_DEV: undefined,
    ACCESS_TEAM_DOMAIN: "jwt-test.cloudflareaccess.com",
    ACCESS_AUD: "memory-audience",
    ALLOWED_EMAIL: "me@example.com",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    expect(String(url)).toBe(
      "https://jwt-test.cloudflareaccess.com/cdn-cgi/access/certs",
    );
    return Response.json({ keys: [key] });
  }) as typeof fetch;
  const sign = (overrides: Record<string, unknown> = {}) =>
    new SignJWT({
      email: "me@example.com",
      iss: "https://jwt-test.cloudflareaccess.com",
      aud: "memory-audience",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60,
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .sign(privateKey);
  try {
    expect(
      (
        await request("/api/session", "GET", undefined, production, {
          "Cf-Access-Jwt-Assertion": await sign(),
        })
      ).body.email,
    ).toBe("me@example.com");
    for (const overrides of [
      { aud: "other" },
      { iss: "https://other.cloudflareaccess.com" },
      { exp: 1 },
    ])
      expect(
        (
          await request("/api/session", "GET", undefined, production, {
            "Cf-Access-Jwt-Assertion": await sign(overrides),
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await request("/api/session", "GET", undefined, production, {
          "Cf-Access-Jwt-Assertion": await sign({ email: "Me@example.com" }),
        })
      ).status,
    ).toBe(403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserves structured source metadata through edits, history and import", async () => {
  const metadata = {
    source: "locum",
    original_text: "size medium",
    source_ids: ["old-1"],
    as_of: null,
    approximate: true,
  };
  const created = await request("/api/records", "POST", { ...fact, metadata });
  expect(created.status).toBe(201);
  const updated = await request(
    `/api/records/${created.body.record.id}`,
    "PATCH",
    { expected_revision: 1, value: "L" },
  );
  expect(updated.body.record.metadata).toEqual(metadata);
  const exported = (await request("/api/export")).body;
  expect(exported.history[0].record.metadata).toEqual(metadata);
  sqlite.exec("DELETE FROM record_history; DELETE FROM records;");
  expect((await request("/api/import", "POST", exported)).status).toBe(201);
  expect((await request("/api/records")).body.records[0].metadata).toEqual(
    metadata,
  );
});
