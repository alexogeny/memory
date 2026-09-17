import { describe, expect, test } from "bun:test";
import {
  deploymentConfig,
  redactOutput,
  requireDeployment,
  chooseDatabase,
} from "../scripts/config";

const input = {
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  CLOUDFLARE_ZONE_ID: "b".repeat(32),
  CLOUDFLARE_API_TOKEN: "test-credential",
  DEPLOY_HOSTNAME: "private.example.com",
  AUTH_USERNAME: "owner",
  AUTH_PASSWORD_HASH:
    "pbkdf2-sha256$100000$" + "a".repeat(64) + "$" + "b".repeat(64),
};

describe("private deployment configuration", () => {
  test("missing authentication configuration prevents deployment", () => {
    expect(() =>
      requireDeployment({ ...input, AUTH_PASSWORD_HASH: "" }),
    ).toThrow("AUTH_PASSWORD_HASH");
    expect(() =>
      requireDeployment({
        ...input,
        DEPLOY_HOSTNAME: "https://private.example.com/",
      }),
    ).toThrow("DEPLOY_HOSTNAME");
  });
  test("generated configuration has no development bypass or public alternatives", () => {
    const config = deploymentConfig(
      requireDeployment(input),
      "database-id",
      "/app",
    );
    expect(config.vars).not.toHaveProperty("LOCAL_DEV");
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.assets.run_worker_first).toBe(true);
    expect(JSON.stringify(config)).not.toContain("test-credential");
    expect(config.routes[0]).toEqual({
      pattern: input.DEPLOY_HOSTNAME,
      custom_domain: true,
      zone_id: input.CLOUDFLARE_ZONE_ID,
    });
  });
  test("ambiguous database selection fails rather than creating or picking one", () => {
    expect(chooseDatabase([], "memory")).toBeNull();
    expect(chooseDatabase([{ name: "memory", uuid: "one" }], "memory")).toBe(
      "one",
    );
    expect(() =>
      chooseDatabase(
        [
          { name: "memory", uuid: "one" },
          { name: "memory", uuid: "two" },
        ],
        "memory",
      ),
    ).toThrow("Ambiguous");
  });
  test("tool output cannot reveal host, account, or credentials", () => {
    const output = Object.values(input).join(" ");
    const redacted = redactOutput(output, Object.values(input));
    for (const value of Object.values(input))
      expect(redacted).not.toContain(value);
    expect(redacted).toContain("[private]");
  });
});

import { convertLocum } from "../scripts/locum-import";

test("Locum conversion keeps measurement uncertainty, separate dates, and revision history", () => {
  const first = {
    id: "record-1",
    subject_id: "self",
    category: "health",
    key: "weight",
    mode: "observation",
    value: { value: 60, unit: "kg", approximate: true },
    observed_at: null,
    as_of: "2026-01-01",
    valid_from: null,
    valid_until: null,
    revision: 1,
    recorded_at: "2026-01-02T00:00:00+00:00",
    reported_at: "2026-01-02T00:00:00+00:00",
    status: "current",
    text: "A fictional measurement",
    source_ids: ["source-1"],
  };
  const current = {
    ...first,
    revision: 2,
    value: { value: 61, unit: "kg", approximate: true },
    recorded_at: "2026-01-03T00:00:00+00:00",
  };
  const converted = convertLocum({
    schema_version: 2,
    subjects: { self: { name: "Example", kind: "self" } },
    records: { "record-1": current },
    history: { "record-1": [first] },
  });
  expect(converted.subjects).toEqual([
    { id: "self", name: "Me", kind: "person" },
  ]);
  expect(converted.history).toHaveLength(2);
  expect(converted.records[0].value).toEqual(current.value);
  expect(converted.records[0].observed_at).toBeNull();
  expect(converted.records[0].metadata.as_of).toBe("2026-01-01");
  expect(converted.records[0].created_at).toBe("2026-01-02T00:00:00.000Z");
  expect(converted.history[1].operation).toBe("update");
});

test("Locum conversion rejects missing revisions rather than silently losing history", () => {
  expect(() =>
    convertLocum({
      schema_version: 2,
      subjects: {},
      records: { x: { id: "x", revision: 2, recorded_at: "2026-01-01" } },
      history: {},
    }),
  ).toThrow("incomplete");
});

import { passwordVerifier } from "../scripts/password";
import { pbkdf2Sync } from "node:crypto";

test("generated login verifiers use distinct salts and match the authentication contract", async () => {
  const password = "Fictional-test-password-only-0123456789!";
  const first = await passwordVerifier(password);
  const second = await passwordVerifier(password);
  expect(first).not.toBe(second);
  expect(first).toMatch(/^pbkdf2-sha256\$100000\$[a-f0-9]{64}\$[a-f0-9]{64}$/);
  const [, , salt, derived] = first.split("$");
  expect(
    Buffer.from(
      pbkdf2Sync(password, Buffer.from(salt!, "hex"), 100000, 32, "sha256"),
    ).toString("hex"),
  ).toBe(derived!);
  await expect(passwordVerifier("short")).rejects.toThrow("generated password");
});
