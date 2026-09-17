import { expect, test } from "@playwright/test";

let subjectId: string;
const origin = "http://127.0.0.1:8790";
test.beforeEach(async ({ page, request }) => {
  const result = await request.post("/api/subjects", {
    headers: { Origin: origin },
    data: {
      name: `Browser fixture ${crypto.randomUUID().slice(0, 8)}`,
      kind: "person",
    },
  });
  expect(result.status()).toBe(201);
  subjectId = (await result.json()).subject.id;
  await page.goto("/");
  await page
    .locator('.mobile-filters select[aria-label="About"]')
    .selectOption(subjectId);
});

test("phone adds, corrects, reviews and retracts a memory", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New memory", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: /^Custom field/ })
    .click();
  await dialog.getByLabel("Field name", { exact: true }).fill("Favourite book");
  await dialog.getByLabel("Value", { exact: true }).fill("The Hobbit");
  await dialog
    .getByRole("button", { name: "Save memory", exact: true })
    .click();
  await page.locator(".category-tile").filter({ hasText: "Profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Favourite book", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Favourite book", exact: true })
    .click();
  await dialog
    .getByLabel("Value", { exact: true })
    .fill("A Wizard of Earthsea");
  await dialog
    .getByRole("button", { name: "Save memory", exact: true })
    .click();
  await expect(page.locator(".memory-card")).toContainText(
    "A Wizard of Earthsea",
  );
  await page
    .getByRole("button", { name: "History of Favourite book", exact: true })
    .click();
  await expect(dialog).toContainText("The Hobbit");
  await expect(dialog).toContainText("Revision 2");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Retract Favourite book", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Retract memory", exact: true })
    .click();
  await expect(page.locator(".memory-card")).toHaveCount(0);
});

test("structured measurements preserve unknown dates, units and uncertainty", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/records", {
    headers: { Origin: origin },
    data: {
      subject_id: subjectId,
      category: "appearance",
      attribute: "underbust",
      kind: "observation",
      value: { value: 74, unit: "cm", approximate: true },
      unit: "cm",
      observed_at: null,
      metadata: { source: "fictional fixture" },
    },
  });
  expect(response.status()).toBe(201);
  const record = (await response.json()).record;
  await page.reload();
  await page
    .locator('.mobile-filters select[aria-label="About"]')
    .selectOption(subjectId);
  await page
    .locator(".category-tile")
    .filter({ hasText: "Appearance" })
    .click();
  await page
    .getByRole("button", { name: "Edit Underbust", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Observed on", { exact: false })).toHaveValue(
    "",
  );
  await dialog
    .getByRole("spinbutton", { name: "Value", exact: true })
    .fill("75");
  await dialog
    .getByRole("button", { name: "Save memory", exact: true })
    .click();
  await expect(page.locator(".memory-card")).toContainText("≈ 75");
  const saved = (
    await (await request.get(`/api/records?subject_id=${subjectId}`)).json()
  ).records[0];
  expect(saved.observed_at).toBeNull();
  expect(saved.value).toEqual({ value: 75, unit: "cm", approximate: true });
  expect(saved.metadata).toEqual(record.metadata);
});

test("guided fields, phone layout and session recovery", async ({ page }) => {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const search = page.getByRole("searchbox", { name: "Search memories" });
  const [input, box] = await Promise.all([
    search.boundingBox(),
    page.locator(".search").boundingBox(),
  ]);
  expect(input!.y + input!.height).toBeLessThanOrEqual(
    box!.y + box!.height + 1,
  );
  await page.getByRole("button", { name: "New memory", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: /^Custom field/ })
    .click();
  await dialog.getByRole("button", { name: "Browse fields" }).click();
  await dialog.getByLabel("Search available fields").fill("Hair");
  await dialog.getByRole("button", { name: "Hair", exact: true }).click();
  await expect(dialog.getByLabel("Color", { exact: true })).toBeVisible();
  await dialog.locator("summary").filter({ hasText: "More details" }).click();
  await expect(
    dialog
      .locator("select")
      .filter({ has: page.locator("option[value=appearance]") }),
  ).toHaveValue("appearance");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.route("**/api/records?**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Sign in" }),
    }),
  );
  await search.fill("expired");
  await expect(
    page.getByRole("button", { name: "Sign in again" }),
  ).toBeVisible();
  await expect(page.locator(".memory-card")).toHaveCount(0);
});

test("exports are downloadable and cache excludes private requests", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .last()
    .click();
  const dialog = page.getByRole("dialog");
  const downloaded = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Export JSON", exact: true })
    .click();
  expect((await downloaded).suggestedFilename()).toMatch(/^memory-.*\.json$/);
  await expect(
    dialog.getByRole("button", { name: "Export Markdown", exact: true }),
  ).toBeVisible();
  const keys = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return (
      await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (request) => new URL(request.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(keys.length).toBeGreaterThan(0);
  expect(
    keys.every(
      (key) =>
        !key.startsWith("/api/") && !key.includes("access") && key !== "/",
    ),
  ).toBe(true);
});

test("a large collection opens as a compact overview on phone and desktop", async ({
  page,
  request,
}) => {
  const categoryNames = [
    "profile",
    "appearance",
    "health",
    "family",
    "places",
    "preferences",
    "style",
    "food",
  ];
  for (let i = 0; i < 42; i++) {
    const result = await request.post("/api/records", {
      headers: { Origin: origin },
      data: {
        subject_id: subjectId,
        category: categoryNames[i % categoryNames.length],
        attribute: `detail_${i}`,
        kind: "fact",
        value: `Fictional detail ${i}`,
      },
    });
    expect(result.status()).toBe(201);
  }
  await page.reload();
  await page
    .locator('.mobile-filters select[aria-label="About"]')
    .selectOption(subjectId);
  await expect(page.locator(".category-tile")).toHaveCount(6);
  await expect(page.locator(".recent-memory")).toHaveCount(4);
  await expect(page.locator(".memory-card")).toHaveCount(0);
  await expect(page.locator(".collection-stats")).toContainText("42");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Show all 8 categories", exact: true })
    .click();
  await expect(page.locator(".category-tile")).toHaveCount(8);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".category-tile")
    .filter({ hasText: "Appearance" })
    .click();
  await expect(page.locator(".memory-card")).toHaveCount(6);
});
