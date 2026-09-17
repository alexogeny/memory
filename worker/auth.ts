import type { Env } from "./index";

const encoder = new TextEncoder();
const cookieName = "__Host-memory_session";
const cookieOptions = "Path=/; HttpOnly; Secure; SameSite=Strict";
const lifetime = 30 * 24 * 60 * 60;
const windowSeconds = 15 * 60;
const perIpAttempts = 5;
const globalAttempts = 50;
export class AuthFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new AuthFailure(status, message);
}
const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
const fromHex = (value: string) =>
  Uint8Array.from(value.match(/../g)!, (value) => Number.parseInt(value, 16));
async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}
function equal(left: Uint8Array, right: Uint8Array) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < 32; index++)
    difference |= left[index]! ^ right[index]!;
  return difference === 0;
}
function configuration(env: Env) {
  if (
    !env.AUTH_USERNAME ||
    env.AUTH_USERNAME.length > 128 ||
    !env.AUTH_USERNAME.trim() ||
    /[\u0000-\u001f]/.test(env.AUTH_USERNAME)
  )
    fail(503, "Sign-in is not configured");
  const match = env.AUTH_PASSWORD_HASH?.match(
    /^pbkdf2-sha256\$100000\$([a-f0-9]{64})\$([a-f0-9]{64})$/,
  );
  if (!match) fail(503, "Sign-in is not configured");
  return {
    username: env.AUTH_USERNAME,
    verifier: env.AUTH_PASSWORD_HASH!,
    salt: fromHex(match[1]!),
    expected: fromHex(match[2]!),
  };
}
async function version(username: string, verifier: string) {
  return hex(await digest(`${username}\n${verifier}`));
}
function sessionToken(request: Request) {
  const matches = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return null;
  const token = matches[0]!.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function authenticate(request: Request, env: Env) {
  if (
    env.LOCAL_DEV === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
  )
    return "local";
  const config = configuration(env);
  const token = sessionToken(request);
  if (!token) fail(401, "Sign in to continue");
  const [tokenHash, credentialVersion] = await Promise.all([
    digest(token),
    version(config.username, config.verifier),
  ]);
  const session = await env.DB.prepare(
    "SELECT token_hash FROM auth_sessions WHERE token_hash = ? AND credential_version = ? AND expires_at > ?",
  )
    .bind(hex(tokenHash), credentialVersion, Math.floor(Date.now() / 1000))
    .first();
  if (!session) fail(401, "Sign in to continue");
  return config.username;
}
async function rateLimit(
  request: Request,
  env: Env,
  credentialVersion: string,
) {
  const now = Math.floor(Date.now() / 1000);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const bucket = `ip:${hex(await digest(`${credentialVersion}\n${ip}`))}`;
  const [admission] = await env.DB.batch([
    env.DB.prepare(
      `
      WITH admission AS MATERIALIZED (
        SELECT 1 WHERE NOT EXISTS (
          SELECT 1 FROM auth_login_limits
          WHERE expires_at > ? AND (
            (bucket_key = 'global' AND attempts >= ?) OR
            (bucket_key = ? AND attempts >= ?)
          )
        )
      )
      INSERT INTO auth_login_limits (bucket_key,attempts,expires_at)
      SELECT 'global',1,? FROM admission
      UNION ALL SELECT ?,1,? FROM admission WHERE true
      ON CONFLICT(bucket_key) DO UPDATE SET
        attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
        expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
      RETURNING bucket_key,attempts
    `,
    ).bind(
      now,
      globalAttempts,
      bucket,
      perIpAttempts,
      now + windowSeconds,
      bucket,
      now + windowSeconds,
      now,
      now,
    ),
    env.DB.prepare(
      "DELETE FROM auth_login_limits WHERE bucket_key IN (SELECT bucket_key FROM auth_login_limits WHERE expires_at <= ? LIMIT 20)",
    ).bind(now),
    env.DB.prepare(
      "DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE expires_at <= ? LIMIT 20)",
    ).bind(now),
  ]);
  if (admission?.results.length !== 2)
    fail(429, "Too many sign-in attempts. Try again in 15 minutes.");
}
export async function login(
  request: Request,
  env: Env,
  input: Record<string, unknown>,
) {
  const config = configuration(env);
  if (
    Object.keys(input).some((key) => !["username", "password"].includes(key)) ||
    typeof input.username !== "string" ||
    !input.username ||
    input.username.length > 128 ||
    typeof input.password !== "string" ||
    !input.password ||
    input.password.length > 256
  )
    fail(400, "Enter a valid username and password");
  const credentialVersion = await version(config.username, config.verifier);
  await rateLimit(request, env, credentialVersion);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const [derived, providedUsername, expectedUsername] = await Promise.all([
    crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: config.salt,
        iterations: 100000,
      },
      key,
      256,
    ),
    digest(input.username),
    digest(config.username),
  ]);
  const passwordMatches = equal(new Uint8Array(derived), config.expected);
  const usernameMatches = equal(providedUsername, expectedUsername);
  if (!(Number(passwordMatches) & Number(usernameMatches)))
    fail(401, "Invalid username or password");
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO auth_sessions (token_hash,credential_version,created_at,expires_at) VALUES (?,?,?,?)",
  )
    .bind(hex(await digest(token)), credentialVersion, now, now + lifetime)
    .run();
  return Response.json(
    { username: config.username },
    {
      headers: {
        "Set-Cookie": `${cookieName}=${token}; ${cookieOptions}; Max-Age=${lifetime}`,
      },
    },
  );
}
export async function logout(request: Request, env: Env) {
  const token = sessionToken(request);
  if (token)
    await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(hex(await digest(token)))
      .run();
  return Response.json(
    { ok: true },
    {
      headers: { "Set-Cookie": `${cookieName}=; ${cookieOptions}; Max-Age=0` },
    },
  );
}
