export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function expiredSession() {
  const error = new ApiError(
    "Your session has expired. Sign in again to continue.",
    401,
  );
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("memory-session-expired", { detail: error }),
    );
  return error;
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "same-origin",
    cache: "no-store",
  }).catch(() => {
    throw new ApiError(
      "Could not connect. Check your connection and try again.",
      0,
    );
  });
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (
    (response.status === 401 || response.redirected) &&
    path !== "/api/auth/login"
  )
    throw expiredSession();
  if (!response.ok)
    throw new ApiError(
      body?.error || "Could not connect. Please try again.",
      response.status,
    );
  if (body === null) throw expiredSession();
  return body as T;
}
