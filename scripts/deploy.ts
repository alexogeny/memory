import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chooseDatabase,
  deploymentConfig,
  redactOutput,
  requireDeployment,
} from "./config";

const root = resolve(import.meta.dir, "..");
const config = requireDeployment(process.env);
const privateValues = Object.values(config);
const configDirectory = resolve(root, ".deploy");
const configPath = resolve(configDirectory, "wrangler.json");
const secretsPath = resolve(configDirectory, "secrets.json");
const environment = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  CI: "true",
};

async function run(args: string[]) {
  const child = Bun.spawn(
    [resolve(root, "node_modules/.bin/wrangler"), ...args],
    {
      cwd: root,
      env: environment,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    console.error(redactOutput(stdout + stderr, privateValues));
    throw new Error(`Wrangler ${args.slice(0, 2).join(" ")} failed (${code})`);
  }
}

async function databaseId() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/d1/database?per_page=1000`,
    {
      headers: { Authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}` },
    },
  );
  const body = (await response.json()) as {
    success: boolean;
    result: { name: string; uuid: string }[];
    result_info?: { total_count?: number };
  };
  if (!response.ok || !body.success || !Array.isArray(body.result))
    throw new Error("Could not discover the deployment database");
  if (
    (body.result_info?.total_count ?? body.result.length) > body.result.length
  )
    throw new Error("Database discovery response is incomplete");
  return chooseDatabase(body.result, "memory");
}

await mkdir(configDirectory, { recursive: true, mode: 0o700 });
try {
  let id = await databaseId();
  await writeFile(
    configPath,
    JSON.stringify(deploymentConfig(config, id, root)),
    { mode: 0o600 },
  );
  if (!id) {
    console.log("Creating the project database.");
    await run([
      "d1",
      "create",
      "memory",
      "--binding",
      "DB",
      "--update-config",
      "--config",
      configPath,
    ]);
    id = await databaseId();
    if (!id)
      throw new Error(
        "Database creation did not return a discoverable database",
      );
  }
  privateValues.push(id);
  await writeFile(
    configPath,
    JSON.stringify(deploymentConfig(config, id, root)),
    { mode: 0o600 },
  );
  await writeFile(
    secretsPath,
    JSON.stringify({
      AUTH_USERNAME: config.AUTH_USERNAME,
      AUTH_PASSWORD_HASH: config.AUTH_PASSWORD_HASH,
    }),
    { mode: 0o600 },
  );
  console.log("Validating deployment and applying database migrations.");
  await run(["deploy", "--dry-run", "--config", configPath]);
  await run([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    configPath,
  ]);
  console.log(
    "Publishing the application with private authentication settings.",
  );
  await run(["deploy", "--config", configPath, "--secrets-file", secretsPath]);
  console.log("Deployment completed.");
} catch (error) {
  console.error(
    redactOutput(
      error instanceof Error ? error.message : "Deployment failed",
      privateValues,
    ),
  );
  process.exitCode = 1;
} finally {
  await rm(configDirectory, { recursive: true, force: true });
}
