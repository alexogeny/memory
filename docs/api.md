# Private memory API

Static assets and the login screen are public. Every data API requires the `__Host-memory_session` cookie. Configure `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` as Worker secrets. The verifier format is `pbkdf2-sha256$100000$<64 lowercase hex salt>$<64 lowercase hex key>`. Missing or invalid configuration returns 503; missing, expired, revoked, or invalid sessions return 401. Local development bypass requires both `LOCAL_DEV=true` and a loopback URL hostname. Never deploy that variable.

Login accepts a username and password in a same-origin JSON request. The username is case-sensitive. Five attempts per IP and 50 globally are allowed in a 15-minute window; the counters live in D1 and excessive attempts return 429 before password derivation. Credentials are not retained in sessions. The cookie carries a random 256-bit token with Secure, HttpOnly, SameSite=Strict, Path=/, and a 30-day absolute lifetime. Only a SHA-256 token hash is stored in D1. Logout deletes that session; changing the username or verifier invalidates all previous sessions. Authentication tables are excluded from memory imports and exports.

Responses use `Cache-Control: no-store`, a restrictive content security policy, frame protection, and no-referrer policy. The Worker does not log request bodies, records, or identity. POST, PATCH, and DELETE require an `Origin` matching the request URL and `Content-Type: application/json`. Failures return `{ "error": "human-readable message" }`. The frontend must clear its in-memory records on authentication failure.

## Data

A subject has `id`, `name`, and `kind` (`person`, `place`, `animal`, or `organization`). The initial subject is `{ "id": "self", "name": "Me", "kind": "person" }`.

A record has `id`, `subject_id`, `category`, `attribute`, `kind` (`fact` or `observation`), `value` (any JSON value), nullable `unit`, nullable `observed_at`, nullable `valid_from`, `metadata` (any JSON value, default `{}`), nullable `valid_to`, positive integer `revision`, `created_at`, `updated_at`, and nullable `retracted_at`. Server-created IDs are UUIDs and timestamps are UTC ISO strings.

Categories are flexible lowercase slugs up to 64 characters, such as `clothing`, `blood-pressure`, or `favourite-walks`. Attributes are trimmed strings up to 160 characters. Values and metadata each permit at most 16,384 serialized characters and 12 nested levels. Units permit 64 characters. Subject names permit 160 characters. IDs permit up to 64 ASCII letters, digits, hyphens, or underscores. Control characters are rejected in names, labels, and IDs.

Dates accept `YYYY-MM-DD` or UTC ISO datetime with optional three-digit milliseconds. Unknown dates remain null. Facts use validity dates and require `observed_at` to be null; observations can have a known or unknown observation date. A validity end cannot precede its start. Exactly one active fact may have the same subject, category, and attribute. Observations can repeat. Source provenance can be retained separately in `metadata`; observation dates must not be invented from import or creation time.

## Routes

| Method and path                | Request                                          | Response                                            |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| POST `/api/auth/login`         | `{username,password}`                            | `{username}` and session cookie                     |
| POST `/api/auth/logout`        | `{}`                                             | `{ok:true}` and expired session cookie              |
| GET `/api/session`             | —                                                | `{username}`                                        |
| GET `/api/subjects`            | —                                                | `{subjects}`                                        |
| POST `/api/subjects`           | `{name,kind}`                                    | 201 `{subject}`                                     |
| GET `/api/records`             | Query described below                            | `{records,next_cursor}`                             |
| POST `/api/records`            | Record fields excluding generated fields         | 201 `{record}`                                      |
| PATCH `/api/records/:id`       | `{expected_revision,...changed writable fields}` | `{record}`                                          |
| DELETE `/api/records/:id`      | `{expected_revision}`                            | `{ok:true}`                                         |
| GET `/api/records/:id/history` | —                                                | `{history}`                                         |
| GET `/api/export`              | —                                                | Version 1 export                                    |
| POST `/api/import`             | Complete version 1 export                        | 201 `{ok:true,imported:{subjects,records,history}}` |

Record listing accepts `subject_id`, `category`, `q`, `limit` (default 100, maximum 200), and `cursor`. Search uses literal case-insensitive substring matching in attribute and serialized value, with at most 200 query characters. Results sort by ID. Pass the returned cursor unchanged with the same filters; null indicates the final page. Retracted records appear in history and export, but not record lists.

PATCH and DELETE require the last seen revision. A stale revision returns 409; an absent or already retracted record returns 404. Successful changes increment the revision and append a full snapshot through a database trigger in the same transaction. DELETE sets `retracted_at`; it preserves the record and history. A new fact may then reuse the same subject/category/attribute.

History is newest revision first. Each entry is `{record_id,revision,operation,record,created_at}`. `operation` is `create`, `update`, or `retract`; `record` is the full snapshot and `created_at` equals its `updated_at` timestamp.

## Backup and import

An export is `{schema_version:1,exported_at,subjects,records,history}`. It includes retracted records and all revisions. The three table reads run in a single D1 batch to produce a consistent snapshot. API export and import are limited to 2,000,000 UTF-8 bytes and 1,000 rows per array. An export over either limit returns 413 with instructions to obtain a database backup; it never silently truncates. Large archives require a D1 backup outside this bounded browser API. Imports remain subject to the deployment plan's D1 query limits.

Import requires complete record histories from revision 1 through the current revision. History IDs, revisions, operations, timestamps, subject references, and final snapshots are validated before any write. The current record must exactly match its last history snapshot. The fixed `self` subject is retained only when the imported name and kind match. All other subject and record IDs are inserted: any existing ID or active fact conflict returns 409 and rolls back the entire batch. Import does not merge or overwrite existing records. An empty installation is the normal restore target.

For a newly imported record, use revision 1 and one `create` history entry containing the same full record. Keep source dates in their original date fields, and retain additional source metadata in `metadata` when needed. Metadata may be omitted on old imports and defaults to `{}`. It is preserved when PATCH does not supply a replacement.

## Verification

`bun test tests/api.test.ts tests/auth.test.ts` uses SQLite in memory with the real D1 migrations and a transactional D1 adapter. It checks SQL uniqueness, revisions, history, retraction, import rollback, round-trip export/import, filters, pagination, validation, response privacy headers, password login, forged and expired cookies, logout, credential rotation, rate limits, and unchanged memory data across the auth migration. Browser tests exercise the mobile flows against local Wrangler. Live Cloudflare configuration and deployment require their own smoke test.
