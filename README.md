# Memory

A private, installable notebook for personal details, measurements, people, and places. The source is public; each deployment and its data stay separate.

- A compact category dashboard, recent edits, and a searchable picker for 149 fields.
- Guided fields and custom memories, with structured values, units, and dates.
- Current facts, dated observations, revision history, and retraction.
- Search and separate subjects for people, animals, places, and organizations.
- JSON backup/import and readable Markdown export.
- Cloudflare Access authentication in front of a Workers API and D1 database.

## Local development

Requires Bun 1.4 and Node.js 22 or newer for Wrangler.

```sh
bun install --frozen-lockfile
bun run dev
```

Open the loopback URL Wrangler prints. Local mode accepts requests only on loopback hostnames. The production deployment generator does not include the development bypass. Local development uses a separate SQLite database; it does not connect to production D1.

```sh
bun run check
bun run test:browser
```

The first command checks TypeScript, runs focused tests, and builds the frontend. Browser checks use fictional fixtures against a local Wrangler instance. Install Chromium with `bunx playwright install chromium` if it is not available.

## Initial deployment

Use an active Cloudflare zone, a GitHub account authenticated with `gh`, and a temporary Cloudflare account token able to provision Access, Workers, D1, routes, and account tokens.

Create an owner-only directory outside this repository. Save the bootstrap token in a file with mode `0600`, and create a separate settings JSON file with the same permissions:

```json
{
  "hostname": "private.example.com",
  "allowedEmail": "owner@example.com",
  "repository": "your-account/memory"
}
```

```sh
bun scripts/bootstrap.ts /private/settings.json /private/bootstrap-token
```

The bootstrap discovers the zone/account, creates or reuses a Zero Trust organization, configures email-code login with one allowed address, creates a dedicated deployment token, and sets repository Actions secrets. Existing conflicting Access policies stop setup for review. Re-running setup reuses saved credentials and resources. Keep the private setup directory outside Git and revoke the temporary bootstrap credential after setup.

The dedicated deployment token grants Workers Scripts Write, D1 Write, and Account Settings Read in the selected account, plus Workers Routes Write and Zone Read for the selected zone. It has no token-management or Access-policy permissions. D1 write permission applies across the account; this is not database-level credential isolation. The deployment token has no client-IP restriction because GitHub-hosted runners use changing addresses.

The required Actions secrets are:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `DEPLOY_HOSTNAME`
- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`
- `ALLOWED_EMAIL`

Push the checked source to `main`. GitHub Actions checks and builds it, discovers or creates the D1 database with Wrangler, applies pending migrations, and deploys the Worker, static assets, authentication secrets, and Custom Domain. Cloudflare configures DNS and HTTPS. Pull requests run checks without deployment secrets. A manual workflow run on `main` can repeat deployment.

Deployment configuration exists only in an ignored, temporary directory. Successful Wrangler output is withheld, and failure output redacts private configuration. No deployment URL is posted to GitHub. Hostname secrecy is not access control: DNS discovery and public certificate logs can still reveal a hostname.

## Bring memories from Locum

Convert a canonical Locum version-2 state file to a Memory export:

```sh
bun scripts/locum-import.ts /private/locum/state.json /private/memory-import.json
```

The converter preserves structured values, subjects, revisions, observation dates, and validity intervals. It keeps the original canonical text, source IDs, reporting time, and as-of date in provenance metadata. It does not copy conversation transcripts or change Locum. Unknown dates stay unknown. The self subject becomes `Me`; other subject names stay intact.

Import the generated file from Settings. Imports are atomic and refuse collisions with existing IDs or active facts. To restore an entire backup, use an empty deployment database. A second import of the same file is rejected rather than overwriting later edits.

## Privacy and recovery

Every deployed request is checked against a signed Cloudflare Access JWT and the configured owner email. Mutations also require same-origin JSON requests. Alternate `workers.dev` and preview URLs are disabled. Personal records are not saved in browser local storage or the service-worker cache. The service worker may cache static assets; viewing and editing records requires a connection and a valid session.

Cloudflare can access server-side stored data: this application is not end-to-end encrypted. Request-body logging and Worker observability are disabled in the deployment configuration.

Retraction removes a memory from the active collection but retains its revision history. It is not permanent erasure. JSON exports include the complete history and should be stored privately. Export regularly; D1 recovery retention depends on the selected Cloudflare plan. For larger backups, use `wrangler d1 export` into a private location.

[API format and limits](docs/api.md) describe validation, conflict responses, and import/export bounds.
