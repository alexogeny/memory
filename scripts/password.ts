export async function passwordVerifier(password: string): Promise<string> {
  if (password.length < 32 || password.length > 256)
    throw new Error("Use a generated password of 32 to 256 characters");
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 },
      key,
      256,
    ),
  );
  const hex = (bytes: Uint8Array) =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `pbkdf2-sha256$100000$${hex(salt)}$${hex(derived)}`;
}
