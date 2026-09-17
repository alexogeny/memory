import { describe, expect, test } from "bun:test";
import { parseValue, recordInput, displayValue } from "../src/model";

describe("memory form values", () => {
  test("preserves structured values and rejects invalid JSON", () => {
    expect(parseValue('{"preferred":true}', "json")).toEqual({
      preferred: true,
    });
    expect(() => parseValue("{", "json")).toThrow("valid JSON");
  });
  test("rejects blank and non-finite numbers", () => {
    for (const value of ["", "Infinity", "not a number"])
      expect(() => parseValue(value, "number")).toThrow();
    expect(parseValue("0", "number")).toBe(0);
  });
  test("builds a dated measurement without a residence range", () => {
    expect(
      recordInput({
        subject_id: "self",
        category: "measurements",
        attribute: "Height",
        value: "172",
        value_type: "number",
        unit: "cm",
        observed_at: "2026-09-17",
        valid_from: "",
        valid_to: "",
        kind: "observation",
      }),
    ).toMatchObject({
      value: 172,
      unit: "cm",
      observed_at: "2026-09-17",
      valid_from: null,
    });
  });
  test("rejects reversed valid dates and empty field names", () => {
    const base = {
      subject_id: "self",
      category: "places",
      attribute: "Address",
      value: "Somewhere",
      value_type: "text",
      unit: "",
      observed_at: "",
      valid_from: "2026-10-01",
      valid_to: "2026-01-01",
      kind: "fact",
    };
    expect(() => recordInput(base)).toThrow("End date");
    expect(() => recordInput({ ...base, attribute: "", valid_to: "" })).toThrow(
      "field name",
    );
  });
  test("formats scalar and structured values without losing false or zero", () => {
    expect(displayValue(false)).toBe("false");
    expect(displayValue(0)).toBe("0");
    expect(displayValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

import { fieldPresets, attributeLabel } from "../src/fields";
test("preset fields use canonical imported keys", () => {
  expect(
    fieldPresets.find((field) => field.name === "Birthday")?.attribute,
  ).toBe("birth_date");
  expect(
    fieldPresets.find((field) => field.name === "Resting heart rate")
      ?.attribute,
  ).toBe("resting_heart_rate");
  expect(attributeLabel("shoulders_bone_to_bone")).toBe("Shoulder width");
});

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
test.each([
  {
    name: "login redirect",
    redirected: true,
    type: "basic",
    mime: "text/html",
    expected: 0,
  },
  {
    name: "login HTML without redirect",
    redirected: false,
    type: "basic",
    mime: "text/html",
    expected: 0,
  },
  {
    name: "opaque response",
    redirected: false,
    type: "opaque",
    mime: "image/png",
    expected: 0,
  },
  {
    name: "approved static response",
    redirected: false,
    type: "basic",
    mime: "image/png",
    expected: 5,
  },
])(
  "service worker installation validates $name",
  async ({ redirected, type, mime, expected }) => {
    const writes: string[] = [];
    const listeners: Record<
      string,
      (event: { waitUntil: (promise: Promise<unknown>) => void }) => void
    > = {};
    const response = {
      ok: true,
      redirected,
      type,
      headers: { get: () => mime },
      clone() {
        return this;
      },
    };
    const cache = {
      addAll: async (urls: string[]) => {
        writes.push(...urls);
      },
      put: async (url: string) => {
        writes.push(url);
      },
    };
    runInNewContext(
      readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
      {
        self: {
          addEventListener: (
            name: string,
            listener: (typeof listeners)[string],
          ) => {
            listeners[name] = listener;
          },
          skipWaiting: () => {},
          location: { origin: "https://memory.invalid" },
        },
        caches: { open: async () => cache },
        fetch: async () => response,
        URL,
        Response,
      },
    );
    let pending = Promise.resolve<unknown>(undefined);
    listeners.install!({
      waitUntil: (promise) => {
        pending = promise;
      },
    });
    await pending;
    expect(writes).toHaveLength(expected);
  },
);

import { overviewCollection } from "../src/model";
test("overview limits recent cards and category previews for a full collection", () => {
  const records = Array.from({ length: 42 }, (_, i) => ({
    id: String(i),
    subject_id: "self",
    category: `area_${i % 9}`,
    attribute: `detail_${i}`,
    kind: "fact" as const,
    value: i,
    unit: null,
    observed_at: null,
    valid_from: null,
    valid_to: null,
    revision: 1,
    created_at: `2026-09-17T00:00:${String(i).padStart(2, "0")}Z`,
    updated_at: `2026-09-17T00:00:${String(i).padStart(2, "0")}Z`,
  }));
  const overview = overviewCollection(records);
  expect(overview.recent).toHaveLength(4);
  expect(overview.recent[0]?.id).toBe("41");
  expect(overview.categories).toHaveLength(9);
  expect(
    overview.categories.every((category) => category.preview.length <= 2),
  ).toBe(true);
  expect(
    overview.categories.reduce((total, category) => total + category.count, 0),
  ).toBe(42);
});

import { sessionReducer } from "../src/session";
test("session expiry removes owner identity before private views render", () => {
  const authenticated = sessionReducer(
    { phase: "checking", username: null },
    { type: "signed-in", username: "owner" },
  );
  expect(authenticated).toEqual({ phase: "authenticated", username: "owner" });
  expect(sessionReducer(authenticated, { type: "expired" })).toEqual({
    phase: "anonymous",
    username: null,
  });
  expect(sessionReducer(authenticated, { type: "signed-out" })).toEqual({
    phase: "anonymous",
    username: null,
  });
});
