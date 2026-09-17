export type SessionState = {
  phase: "checking" | "authenticated" | "anonymous";
  username: string | null;
};
export type SessionAction =
  { type: "signed-in"; username: string } | { type: "expired" | "signed-out" };
export function sessionReducer(
  _state: SessionState,
  action: SessionAction,
): SessionState {
  return action.type === "signed-in"
    ? { phase: "authenticated", username: action.username }
    : { phase: "anonymous", username: null };
}
