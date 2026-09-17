import {
  beforeAll,
  beforeEach,
  afterEach,
  expect,
  test,
  spyOn,
} from "bun:test";
import { Database } from "bun:sqlite";
import worker, { type Env } from "../worker/index";

let sqlite: Database;
let verifier: string;
let env: Env;
const password = "test-only-high-entropy-password-32-chars";
const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
beforeAll(async () => {
  const salt = new Uint8Array(32).fill(19);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  verifier = `pbkdf2-sha256$100000$${hex(salt)}$${hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256))}`;
});
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
beforeEach(async () => {
  sqlite = new Database(":memory:");
  sqlite.exec(
    await Bun.file(new URL("../migrations/0001.sql", import.meta.url)).text(),
  );
  const migration = Bun.file(
    new URL("../migrations/0002_auth.sql", import.meta.url),
  );
  sqlite.exec(await migration.text());
  env = {
    AUTH_USERNAME: "owner",
    AUTH_PASSWORD_HASH: verifier,
    DB: {
      prepare: (sql: string) => new Statement(sql),
      batch: async (statements: Statement[]) =>
        sqlite.transaction(() =>
          statements.map((s) => ({
            results: sqlite.query(s.sql).all(...(s.values as any[])),
          })),
        )(),
    } as any,
    ASSETS: {
      fetch: async () => new Response("<html>Public login shell</html>"),
    },
  };
});
afterEach(() => sqlite.close());
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  cookie?: string,
  overrides: Partial<Env> = {},
  headers: Record<string, string> = {},
) {
  return worker.fetch(
    new Request(`https://memory.example${path}`, {
      method,
      headers: {
        Origin: "https://memory.example",
        "Content-Type": "application/json",
        "CF-Connecting-IP": "192.0.2.1",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    { ...env, ...overrides },
  );
}
async function signIn() {
  const result = await request("/api/auth/login", "POST", {
    username: "owner",
    password,
  });
  expect(result.status).toBe(200);
  return result.headers.get("Set-Cookie")!.split(";")[0]!;
}
test("public shell remains available but API fails closed without configuration or sessions", async () => {
  expect((await request("/")).status).toBe(200);
  expect((await request("/api/records")).status).toBe(401);
  expect((await request("/api")).status).toBe(401);
  expect(
    (
      await request("/api/session", "GET", undefined, undefined, {
        AUTH_PASSWORD_HASH: undefined,
      })
    ).status,
  ).toBe(503);
  expect(
    (
      await request(
        "/api/auth/login",
        "POST",
        { username: "owner", password },
        undefined,
        { AUTH_PASSWORD_HASH: "bad" },
      )
    ).status,
  ).toBe(503);
});
test("login sets a secure opaque cookie whose hashed session expires in thirty days", async () => {
  const response = await request("/api/auth/login", "POST", {
    username: "owner",
    password,
  });
  expect(response.status).toBe(200);
  expect((await response.json()) as Record<string, unknown>).toEqual({
    username: "owner",
  });
  const cookie = response.headers.get("Set-Cookie")!;
  expect(cookie).toMatch(
    /^__Host-memory_session=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000$/,
  );
  const session = sqlite.query("SELECT * FROM auth_sessions").get() as any;
  expect(session.token_hash).not.toBe(cookie.split(";")[0]!.split("=")[1]);
  expect(session.expires_at - Math.floor(Date.now() / 1000)).toBeWithin(
    2591995,
    2592001,
  );
  expect(
    (await (
      await request("/api/session", "GET", undefined, cookie.split(";")[0])
    ).json()) as Record<string, unknown>,
  ).toEqual({ username: "owner" });
  expect(
    (
      await request("/api/export", "GET", undefined, cookie.split(";")[0])
    ).headers.get("Cache-Control"),
  ).toBe("no-store");
  const exported = (await (
    await request("/api/export", "GET", undefined, cookie.split(";")[0])
  ).json()) as any;
  expect(Object.keys(exported).sort()).toEqual([
    "exported_at",
    "history",
    "records",
    "schema_version",
    "subjects",
  ]);
});
test("wrong username and password share generic failure and forged cookies cannot authenticate", async () => {
  const wrongName = await request("/api/auth/login", "POST", {
    username: "Owner",
    password,
  });
  const wrongPassword = await request("/api/auth/login", "POST", {
    username: "owner",
    password: "wrong",
  });
  expect(wrongName.status).toBe(401);
  expect(wrongPassword.status).toBe(401);
  expect(await wrongName.json()).toEqual(await wrongPassword.json());
  expect(
    (
      await request(
        "/api/session",
        "GET",
        undefined,
        `__Host-memory_session=${"a".repeat(64)}`,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await request(
        "/api/session",
        "GET",
        undefined,
        "__Host-memory_session=bad",
      )
    ).status,
  ).toBe(401);
});
test("expiry, logout revocation and credential rotation invalidate sessions", async () => {
  let cookie = await signIn();
  sqlite.exec("UPDATE auth_sessions SET expires_at = 1");
  expect((await request("/api/session", "GET", undefined, cookie)).status).toBe(
    401,
  );
  cookie = await signIn();
  expect(
    (
      await request("/api/session", "GET", undefined, cookie, {
        AUTH_USERNAME: "new-owner",
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await request("/api/session", "GET", undefined, cookie, {
        AUTH_PASSWORD_HASH:
          verifier.slice(0, -1) + (verifier.endsWith("0") ? "1" : "0"),
      })
    ).status,
  ).toBe(401);
  const loggedOut = await request("/api/auth/logout", "POST", {}, cookie);
  expect(loggedOut.status).toBe(200);
  expect(loggedOut.headers.get("Set-Cookie")).toContain("Max-Age=0");
  expect((await request("/api/session", "GET", undefined, cookie)).status).toBe(
    401,
  );
});
test("per-IP and global rate limits persist in D1 before password verification", async () => {
  for (let i = 0; i < 5; i++)
    expect(
      (
        await request("/api/auth/login", "POST", {
          username: "owner",
          password: "wrong",
        })
      ).status,
    ).toBe(401);
  const kdf = spyOn(crypto.subtle, "deriveBits");
  try {
    expect(
      (
        await request("/api/auth/login", "POST", {
          username: "owner",
          password,
        })
      ).status,
    ).toBe(429);
    expect(kdf).not.toHaveBeenCalled();
  } finally {
    kdf.mockRestore();
  }
  expect(
    (
      await request(
        "/api/auth/login",
        "POST",
        { username: "owner", password },
        undefined,
        {},
        { "CF-Connecting-IP": "192.0.2.2" },
      )
    ).status,
  ).toBe(200);
  sqlite.exec(
    "UPDATE auth_login_limits SET attempts = 50 WHERE bucket_key = 'global'",
  );
  expect(
    (
      await request(
        "/api/auth/login",
        "POST",
        { username: "owner", password },
        undefined,
        {},
        { "CF-Connecting-IP": "192.0.2.3" },
      )
    ).status,
  ).toBe(429);
  sqlite.exec("UPDATE auth_login_limits SET expires_at = 1");
  expect(
    (await request("/api/auth/login", "POST", { username: "owner", password }))
      .status,
  ).toBe(200);
  const buckets = sqlite
    .query("SELECT bucket_key FROM auth_login_limits")
    .all();
  expect(JSON.stringify(buckets)).not.toContain("192.0.2.");
});
test("rejects CSRF, malformed and oversized login before creating limiter rows", async () => {
  expect(
    (
      await request(
        "/api/auth/login",
        "POST",
        { username: "owner", password },
        undefined,
        {},
        { Origin: "https://evil.example" },
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/api/auth/login",
        "POST",
        { username: "owner", password },
        undefined,
        {},
        { "Content-Type": "text/plain" },
      )
    ).status,
  ).toBe(415);
  expect(
    (
      await request("/api/auth/login", "POST", {
        username: "owner",
        password: "x".repeat(257),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request("/api/auth/login", "POST", {
        username: "x".repeat(129),
        password,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request("/api/auth/login", "POST", {
        username: "owner",
        password,
        padding: "x".repeat(4096),
      })
    ).status,
  ).toBe(413);
  const malformed = await worker.fetch(
    new Request("https://memory.example/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "https://memory.example",
        "Content-Type": "application/json",
      },
      body: "{",
    }),
    env,
  );
  expect(malformed.status).toBe(400);
  expect(
    sqlite.query("SELECT COUNT(*) AS count FROM auth_login_limits").get(),
  ).toEqual({ count: 0 });
  const cookie = await signIn();
  expect(
    (
      await request(
        "/api/auth/logout",
        "POST",
        {},
        cookie,
        {},
        { Origin: "https://evil.example" },
      )
    ).status,
  ).toBe(403);
  expect((await request("/api/session", "GET", undefined, cookie)).status).toBe(
    200,
  );
});

test("auth migration leaves an existing forty-two-record database unchanged", async () => {
  const existing = new Database(":memory:");
  try {
    existing.exec(
      await Bun.file(new URL("../migrations/0001.sql", import.meta.url)).text(),
    );
    const insert = existing.query(
      "INSERT INTO records (id,subject_id,category,attribute,kind,value,revision,created_at,updated_at) VALUES (?,'self','existing',?,'fact',?,1,'2026-09-17','2026-09-17')",
    );
    for (let index = 0; index < 42; index++)
      insert.run(
        `record-${index}`,
        `attribute ${index}`,
        JSON.stringify({ existing: index }),
      );
    const before = existing.query("SELECT * FROM records ORDER BY id").all();
    const historyBefore = existing
      .query("SELECT * FROM record_history ORDER BY record_id")
      .all();
    existing.exec(
      await Bun.file(
        new URL("../migrations/0002_auth.sql", import.meta.url),
      ).text(),
    );
    expect(existing.query("SELECT * FROM records ORDER BY id").all()).toEqual(
      before,
    );
    expect(
      existing.query("SELECT * FROM record_history ORDER BY record_id").all(),
    ).toEqual(historyBefore);
    expect(
      existing.query("SELECT COUNT(*) AS count FROM records").get(),
    ).toEqual({ count: 42 });
  } finally {
    existing.close();
  }
});

test("blocked IP requests do not consume global admission or add rows after saturation", async () => {
  for (let index = 0; index < 50; index++) {
    expect(
      (
        await request("/api/auth/login", "POST", {
          username: "owner",
          password: "wrong",
        })
      ).status,
    ).toBe(index < 5 ? 401 : 429);
  }
  expect(
    (
      await request(
        "/api/auth/login",
        "POST",
        { username: "owner", password },
        undefined,
        {},
        { "CF-Connecting-IP": "192.0.2.2" },
      )
    ).status,
  ).toBe(200);
  expect(
    sqlite
      .query(
        "SELECT attempts FROM auth_login_limits WHERE bucket_key = 'global'",
      )
      .get(),
  ).toEqual({ attempts: 6 });
  sqlite.exec(
    "UPDATE auth_login_limits SET attempts = 50 WHERE bucket_key = 'global'",
  );
  const before = sqlite
    .query("SELECT COUNT(*) AS count FROM auth_login_limits")
    .get();
  const kdf = spyOn(crypto.subtle, "deriveBits");
  try {
    for (let index = 3; index < 23; index++)
      expect(
        (
          await request(
            "/api/auth/login",
            "POST",
            { username: "owner", password },
            undefined,
            {},
            { "CF-Connecting-IP": `192.0.2.${index}` },
          )
        ).status,
      ).toBe(429);
    expect(kdf).not.toHaveBeenCalled();
  } finally {
    kdf.mockRestore();
  }
  expect(
    sqlite.query("SELECT COUNT(*) AS count FROM auth_login_limits").get(),
  ).toEqual(before);
  expect(
    sqlite
      .query(
        "SELECT attempts FROM auth_login_limits WHERE bucket_key = 'global'",
      )
      .get(),
  ).toEqual({ attempts: 50 });
});

test("the last global admission slot is consumed once across concurrent IPs", async () => {
  sqlite
    .query("INSERT INTO auth_login_limits VALUES ('global',49,?)")
    .run(Math.floor(Date.now() / 1000) + 900);
  const results = await Promise.all(
    ["192.0.2.10", "192.0.2.11"].map((ip) =>
      request(
        "/api/auth/login",
        "POST",
        { username: "owner", password },
        undefined,
        {},
        { "CF-Connecting-IP": ip },
      ),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([200, 429]);
  expect(
    sqlite
      .query(
        "SELECT attempts FROM auth_login_limits WHERE bucket_key = 'global'",
      )
      .get(),
  ).toEqual({ attempts: 50 });
  expect(
    sqlite.query("SELECT COUNT(*) AS count FROM auth_login_limits").get(),
  ).toEqual({ count: 2 });
});
