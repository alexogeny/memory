CREATE TABLE auth_sessions (
 token_hash TEXT PRIMARY KEY,
 credential_version TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_login_limits (
 bucket_key TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX auth_login_limits_expiry ON auth_login_limits(expires_at);
