import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  LoaderCircle,
} from "lucide-react";
import { api } from "../api";
import { Button } from "./ui/button";
export function Login({
  onSignedIn,
}: {
  onSignedIn: (username: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ username: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setPassword("");
      onSignedIn(result.username);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-screen m-0 flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <div className="login-orb pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <section className="relative w-full max-w-[360px]">
        <div className="mb-11">
          <div className="mb-7 flex size-16 items-center justify-center rounded-[22px] bg-primary/12 text-primary">
            <Leaf size={31} />
          </div>
          <div className="text-3xl font-bold tracking-[-1.5px]">
            memory<span className="text-primary">.</span>
          </div>
          <h1 className="mt-9 text-[28px] font-semibold tracking-tight">
            Welcome back.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your memories are right where you left them.
          </p>
        </div>
        <form onSubmit={submit} className="grid gap-5">
          <label
            className="grid gap-2 text-xs font-semibold"
            htmlFor="username"
          >
            Username
            <input
              className="login-input h-13 rounded-2xl border border-border bg-card px-4 text-base outline-none focus:ring-4 focus:ring-ring/15"
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label
            className="grid gap-2 text-xs font-semibold"
            htmlFor="password"
          >
            Password
            <div className="relative">
              <input
                className="login-input h-13 w-full rounded-2xl border border-border bg-card px-4 pr-13 text-base outline-none focus:ring-4 focus:ring-ring/15"
                id="password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Button
                className="absolute right-1.5 top-1.5"
                type="button"
                variant="ghost"
                size="icon"
                aria-label={visible ? "Hide password" : "Show password"}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy}
            className="mt-2 h-13 w-full rounded-2xl"
          >
            {busy ? (
              <>
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight />
              </>
            )}
          </Button>
        </form>
        <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <LockKeyhole size={13} />
          Your private space
        </div>
      </section>
    </main>
  );
}
