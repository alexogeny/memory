import { ApiError } from "../api";
export function ErrorNotice({
  error,
  retry,
}: {
  error: Error | null;
  retry?: () => void;
}) {
  return error ? (
    <div className="error" role="alert">
      <span>{error.message}</span>
      {error instanceof ApiError && error.status === 401 ? (
        <button onClick={() => location.reload()}>Sign in again</button>
      ) : retry ? (
        <button onClick={retry}>Try again</button>
      ) : null}
    </div>
  ) : null;
}
