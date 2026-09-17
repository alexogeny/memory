import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Moon,
  Sun,
  LogOut,
} from "lucide-react";
import { api } from "../api";
import { downloadMarkdown, type ExportData } from "../export";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Switch } from "./ui/switch";
import { Dialog } from "./ui/dialog";
import { ErrorNotice } from "./ErrorNotice";
export function Settings({
  onClose,
  onImported,
  theme,
  setTheme,
  onSignOut,
  embedded = false,
}: {
  onClose: () => void;
  onSignOut: () => Promise<void>;
  embedded?: boolean;
  onImported: () => void;
  theme: string;
  setTheme: (value: string) => void;
}) {
  const [error, setError] = useState<Error | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    name: string;
    value: unknown;
  } | null>(null);
  const content = (
    <>
      <section className="settings-section">
        <h3>Appearance</h3>
        <p className="muted">A look that feels like you.</p>
        <Tabs value={theme} onValueChange={setTheme}>
          <TabsList className="w-full">
            {[
              { id: "light", name: "Light", Icon: Sun },
              { id: "dark", name: "Dark", Icon: Moon },
            ].map(({ id, name, Icon }) => (
              <TabsTrigger key={id} value={id}>
                <Icon size={17} />
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="mt-5 flex items-center justify-between gap-4">
          <label htmlFor="follow-system" className="text-sm font-medium">
            Use device appearance
          </label>
          <Switch
            id="follow-system"
            checked={theme === "system"}
            onCheckedChange={(checked) =>
              setTheme(checked ? "system" : "light")
            }
          />
        </div>
      </section>
      <section className="settings-section">
        <h3>Your data</h3>
        <p className="muted">
          Export a complete JSON backup or a readable Markdown copy. Bring
          memories in from a previous JSON export. Keep exported files somewhere
          private.
        </p>
        <div className="settings-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setError(null);
              setBusy(true);
              try {
                const data = await api("/api/export");
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(data, null, 2)], {
                    type: "application/json",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = `memory-${new Date().toISOString().slice(0, 10)}.json`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setMessage("Your export is ready.");
              } catch (e) {
                setError(e as Error);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ArrowDownToLine size={17} />
            Export JSON
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setError(null);
              setBusy(true);
              try {
                const data = await api<ExportData>("/api/export");
                downloadMarkdown(data);
                setMessage("Your Markdown export is ready.");
              } catch (e) {
                setError(e as Error);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ArrowDownToLine size={17} />
            Export Markdown
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
            <ArrowUpFromLine size={17} />
            Import JSON
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label="Import JSON file"
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              if (!selected) return;
              setError(null);
              try {
                if (selected.size > 2_000_000)
                  throw new Error("Choose a JSON file smaller than 2 MB.");
                setPending({
                  name: selected.name,
                  value: JSON.parse(await selected.text()),
                });
              } catch {
                setError(
                  new Error(
                    "Could not read this file. Choose a valid JSON export under 2 MB.",
                  ),
                );
              }
              e.target.value = "";
            }}
          />
        </div>
        {pending && (
          <div className="import-confirm">
            <p>
              Import <strong>{pending.name}</strong>? Memories in this file will
              be added to your collection.
            </p>
            <div className="settings-actions">
              <button
                className="button secondary"
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api("/api/import", {
                      method: "POST",
                      body: JSON.stringify(pending.value),
                    });
                    setPending(null);
                    setMessage("Memories imported.");
                    onImported();
                  } catch (e) {
                    setError(e as Error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Importing…" : "Import memories"}
              </button>
            </div>
          </div>
        )}
      </section>
      <ErrorNotice error={error} />
      {message && (
        <p className="success" role="status">
          <Check size={16} />
          {message}
        </p>
      )}
      <Button
        className="mt-6 w-full justify-start"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await onSignOut();
          } catch (error) {
            setError(error as Error);
            setBusy(false);
          }
        }}
      >
        <LogOut />
        Sign out
      </Button>
    </>
  );
  return embedded ? (
    <div className="settings-page">{content}</div>
  ) : (
    <Dialog title="Settings" onClose={onClose}>
      {content}
    </Dialog>
  );
}
