import { pbkdf2Sync } from "node:crypto";
import { resolve } from "node:path";

export const browserLogin = {
  username: "browser-owner",
  password: "Fictional-browser-password-only-0123456789!",
};

if (import.meta.main) {
  const development = process.argv.includes("--development");
  const root = resolve(import.meta.dir, "..");
  const state = resolve(root, ".wrangler", `browser-auth-${Date.now()}`);
  const salt = Buffer.alloc(32, 7);
  const hash = `pbkdf2-sha256$100000$${salt.toString("hex")}$${Buffer.from(pbkdf2Sync(browserLogin.password, salt, 100000, 32, "sha256")).toString("hex")}`;
  const run = (args: string[]) =>
    Bun.spawn([resolve(root, "node_modules/.bin/wrangler"), ...args], {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdout: "inherit",
      stderr: "inherit",
    });
  const migration = await run([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    state,
  ]).exited;
  if (migration !== 0)
    throw new Error("Browser auth database migration failed");
  const server = run([
    "dev",
    "--ip",
    "127.0.0.1",
    "--port",
    development ? "8790" : "8791",
    "--inspector-port",
    development ? "9230" : "9231",
    "--local-protocol",
    development ? "http" : "https",
    "--persist-to",
    state,
    "--var",
    `LOCAL_DEV:${development}`,
    "--var",
    `AUTH_USERNAME:${browserLogin.username}`,
    "--var",
    `AUTH_PASSWORD_HASH:${hash}`,
  ]);
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.on(signal, () => server.kill(signal));
  process.exitCode = await server.exited;
}
