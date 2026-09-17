import { resolve } from "node:path";

const required = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ZONE_ID",
  "CLOUDFLARE_API_TOKEN",
  "DEPLOY_HOSTNAME",
  "ACCESS_TEAM_DOMAIN",
  "ACCESS_AUD",
  "ALLOWED_EMAIL",
] as const;
export type Deployment = Record<(typeof required)[number], string>;

export function requireDeployment(
  env: Record<string, string | undefined>,
): Deployment {
  const result = {} as Deployment;
  for (const key of required) {
    const value = env[key]?.trim();
    if (!value) throw new Error(`Missing ${key}`);
    result[key] = value;
  }
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(result.DEPLOY_HOSTNAME))
    throw new Error("Invalid DEPLOY_HOSTNAME");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(result.ACCESS_TEAM_DOMAIN))
    throw new Error("Invalid ACCESS_TEAM_DOMAIN");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.ALLOWED_EMAIL))
    throw new Error("Invalid ALLOWED_EMAIL");
  for (const key of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ZONE_ID"] as const) {
    if (!/^[a-f0-9]{32}$/.test(result[key])) throw new Error(`Invalid ${key}`);
  }
  return result;
}

export function deploymentConfig(
  config: Deployment,
  databaseId: string | null,
  root: string,
) {
  return {
    name: "memory",
    main: resolve(root, "worker/index.ts"),
    compatibility_date: "2026-09-17",
    account_id: config.CLOUDFLARE_ACCOUNT_ID,
    workers_dev: false,
    preview_urls: false,
    assets: {
      directory: resolve(root, "dist"),
      binding: "ASSETS",
      run_worker_first: true,
      not_found_handling: "single-page-application",
    },
    routes: [
      {
        pattern: config.DEPLOY_HOSTNAME,
        custom_domain: true,
        zone_id: config.CLOUDFLARE_ZONE_ID,
      },
    ],
    d1_databases: databaseId
      ? [
          {
            binding: "DB",
            database_name: "memory",
            database_id: databaseId,
            migrations_dir: resolve(root, "migrations"),
          },
        ]
      : [],
    vars: {},
    observability: { enabled: false },
  };
}

export function chooseDatabase(
  databases: { name: string; uuid: string }[],
  name: string,
): string | null {
  const matches = databases.filter((database) => database.name === name);
  if (matches.length > 1) throw new Error("Ambiguous database selection");
  return matches[0]?.uuid ?? null;
}

export function redactOutput(output: string, privateValues: string[]): string {
  let result = output;
  for (const value of privateValues
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    result = result.replaceAll(value, "[private]");
  }
  return result
    .replace(/https?:\/\/[^\s"'<>]+/g, "[url]")
    .replace(/\b[a-f0-9]{32,64}\b/g, "[identifier]");
}
