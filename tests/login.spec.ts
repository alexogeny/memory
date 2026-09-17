import { expect, test } from "@playwright/test";
import { browserLogin } from "../scripts/browser-server";

test.use({ baseURL: "https://127.0.0.1:8791", ignoreHTTPSErrors: true });

test("password login, restored session and sign-out work over HTTPS without a development bypass", async ({
  page,
  context,
}) => {
  expect((await context.request.get("/api/records")).status()).toBe(401);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toHaveAttribute(
    "autocomplete",
    "username",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await page
    .getByLabel("Username", { exact: true })
    .fill(browserLogin.username);
  await page.getByLabel("Password", { exact: true }).fill("incorrect");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid username or password",
  );
  await page
    .getByLabel("Password", { exact: true })
    .fill(browserLogin.password);
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New memory", exact: true }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (item) => item.name === "__Host-memory_session",
  );
  expect(cookie).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
  });
  expect((await context.request.get("/api/session")).status()).toBe(200);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "New memory", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect((await context.request.get("/api/records")).status()).toBe(401);
  expect(
    (await context.cookies()).some(
      (item) => item.name === "__Host-memory_session",
    ),
  ).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    browserLogin.password,
  );
});
