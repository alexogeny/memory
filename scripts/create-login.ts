import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { passwordVerifier } from "./password";

const [settingsPath] = process.argv.slice(2);
if (!settingsPath)
  throw new Error("Usage: bun scripts/create-login.ts /private/settings.json");
const root = resolve(import.meta.dir, "..");
if (
  resolve(settingsPath).startsWith(root + "/") ||
  (await stat(settingsPath)).mode & 0o077
)
  throw new Error("Settings must be private and outside the repository");
const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
  hostname: string;
  username: string;
  vault?: string;
};
if (
  !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(settings.hostname) ||
  !settings.username?.trim() ||
  settings.username.length > 128 ||
  /[\u0000-\u001f]/.test(settings.username)
)
  throw new Error("Invalid hostname or username");
const destination = resolve(dirname(settingsPath), "auth-private.json");
if (await Bun.file(destination).exists())
  throw new Error(
    "Private login settings already exist; use an explicit rotation workflow",
  );
async function op(args: string[]) {
  const child = Bun.spawn(["op", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, , code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new Error(
      "1Password operation failed. Unlock 1Password and check CLI access.",
    );
  return JSON.parse(out);
}
const vault = settings.vault || "Private";
const existing = await op([
  "item",
  "list",
  "--vault",
  vault,
  "--tags",
  "memory-pwa",
  "--format",
  "json",
]);
if (existing.length)
  throw new Error(
    "A tagged Memory login already exists; reuse it rather than creating a duplicate",
  );
const item = await op([
  "item",
  "create",
  "--category",
  "login",
  "--title",
  "Memory",
  "--vault",
  vault,
  "--url",
  `https://${settings.hostname}`,
  "--generate-password=letters,digits,symbols,40",
  "--tags",
  "memory-pwa",
  `username=${settings.username}`,
  "--format",
  "json",
]);
const password = item.fields.find(
  (field: { id: string }) => field.id === "password",
)?.value;
if (typeof password !== "string")
  throw new Error("1Password did not return the generated password");
await writeFile(
  destination,
  JSON.stringify(
    {
      AUTH_USERNAME: settings.username,
      AUTH_PASSWORD_HASH: await passwordVerifier(password),
      ONEPASSWORD_ITEM_ID: item.id,
      ONEPASSWORD_VAULT_ID: item.vault.id,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created the Memory login in 1Password. Only the salted verifier was saved in private setup files.",
);
