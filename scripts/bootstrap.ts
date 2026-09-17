import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { redactOutput } from "./config";

type Data = Record<string, any>;
const [settingsPath, tokenPath] = process.argv.slice(2);
if (!settingsPath || !tokenPath)
  throw new Error(
    "Usage: bun scripts/bootstrap.ts /private/settings.json /private/bootstrap-token",
  );
const root = resolve(import.meta.dir, "..");
for (const path of [settingsPath, tokenPath]) {
  if (resolve(path).startsWith(root + "/"))
    throw new Error("Bootstrap inputs must be outside the repository");
  if ((await stat(path)).mode & 0o077)
    throw new Error("Bootstrap inputs must have owner-only permissions");
}
const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
  hostname: string;
  username: string;
  repository: string;
};
if (
  !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(settings.hostname) ||
  !settings.username?.trim() ||
  settings.username.length > 128 ||
  /[\u0000-\u001f]/.test(settings.username) ||
  !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(settings.repository)
)
  throw new Error("Invalid bootstrap settings");
const token = (await readFile(tokenPath, "utf8")).trim();
const privateValues = [token, settings.hostname, settings.username];
const privateDirectory = dirname(resolve(settingsPath));

async function api(path: string, method = "GET", body?: unknown): Promise<any> {
  const response = await fetch("https://api.cloudflare.com/client/v4" + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = (await response.json()) as Data;
  if (!response.ok || !value.success)
    throw new Error(
      `Cloudflare request failed: ${redactOutput(JSON.stringify(value.errors), privateValues)}`,
    );
  return value.result;
}
async function save(name: string, value: unknown) {
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    resolve(privateDirectory, name),
    JSON.stringify(value, null, 2) + "\n",
    { mode: 0o600 },
  );
}
async function gh(args: string[], input?: string, optional = false) {
  const child = Bun.spawn(["gh", ...args], {
    cwd: root,
    stdin: input === undefined ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code && !optional) throw new Error(redactOutput(err, privateValues));
  return { out, err, code };
}

try {
  const zones: Data[] = await api("/zones?per_page=50");
  const matching = zones
    .filter((zone) => settings.hostname.endsWith("." + zone.name))
    .sort((a, b) => b.name.length - a.name.length);
  if (!matching.length || matching[0].status !== "active")
    throw new Error("No active Cloudflare zone matches the hostname");
  const zone = matching[0],
    account = zone.account.id;
  privateValues.push(account, zone.id);
  const auth = JSON.parse(
    await readFile(resolve(privateDirectory, "auth-private.json"), "utf8"),
  );
  if (
    auth.AUTH_USERNAME !== settings.username ||
    !/^pbkdf2-sha256\$100000\$[a-f0-9]{64}\$[a-f0-9]{64}$/.test(
      auth.AUTH_PASSWORD_HASH,
    )
  )
    throw new Error(
      "Create matching private login settings before bootstrapping",
    );
  privateValues.push(auth.AUTH_PASSWORD_HASH);
  const configuration = {
    CLOUDFLARE_ACCOUNT_ID: account,
    CLOUDFLARE_ZONE_ID: zone.id,
    DEPLOY_HOSTNAME: settings.hostname,
    AUTH_USERNAME: auth.AUTH_USERNAME,
    AUTH_PASSWORD_HASH: auth.AUTH_PASSWORD_HASH,
  };
  await save("deployment.json", configuration);
  let deploymentToken: Data;
  try {
    deploymentToken = JSON.parse(
      await readFile(
        resolve(privateDirectory, "deployment-token.json"),
        "utf8",
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const existing: Data[] = await api(`/accounts/${account}/tokens`);
    if (existing.some((item) => item.name === "memory-github-deploy"))
      throw new Error(
        "Deployment token already exists, but its private local value is missing; rotate it explicitly",
      );
    const groups: Data[] = await api(
      `/accounts/${account}/tokens/permission_groups`,
    );
    const permissions = (names: string[]) =>
      names.map((name) => {
        const match = groups.filter((group) => group.name === name);
        if (match.length !== 1)
          throw new Error("Cannot identify permission " + name);
        return { id: match[0].id };
      });
    deploymentToken = await api(`/accounts/${account}/tokens`, "POST", {
      name: "memory-github-deploy",
      policies: [
        {
          effect: "allow",
          resources: { [`com.cloudflare.api.account.${account}`]: "*" },
          permission_groups: permissions([
            "Workers Scripts Write",
            "D1 Write",
            "Account Settings Read",
          ]),
        },
        {
          effect: "allow",
          resources: { [`com.cloudflare.api.account.zone.${zone.id}`]: "*" },
          permission_groups: permissions(["Workers Routes Write", "Zone Read"]),
        },
      ],
    });
    await save("deployment-token.json", deploymentToken);
  }
  privateValues.push(deploymentToken.value);
  const repository = await gh(
    ["repo", "view", settings.repository, "--json", "nameWithOwner"],
    undefined,
    true,
  );
  if (repository.code) {
    if (!repository.err.includes("Could not resolve to a Repository"))
      throw new Error("Could not verify repository access");
    await gh([
      "repo",
      "create",
      settings.repository,
      "--public",
      "--source",
      root,
      "--remote",
      "origin",
    ]);
  }
  for (const [name, value] of Object.entries({
    ...configuration,
    CLOUDFLARE_API_TOKEN: deploymentToken.value,
  }))
    await gh(
      ["secret", "set", name, "--repo", settings.repository],
      String(value),
    );
  console.log(
    "Deployment credentials, password login, and repository secrets are configured.",
  );
  console.log(
    "Push the checked application to main to create D1 and deploy through Actions.",
  );
} catch (error) {
  console.error(
    redactOutput(
      error instanceof Error ? error.message : "Bootstrap failed",
      privateValues,
    ),
  );
  process.exitCode = 1;
}
