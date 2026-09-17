import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { api } from "../api";
import { displayValue, type MemoryRecord, type Subject } from "../model";
import { attributeLabel } from "../fields";
import { Dialog } from "./ui/dialog";
import { ErrorNotice } from "./ErrorNotice";
const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
export function AddSubject({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (subject: Subject) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("person");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Add someone or somewhere" onClose={onClose}>
      <form
        className="memory-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const result = await api<{ subject: Subject }>("/api/subjects", {
              method: "POST",
              body: JSON.stringify({ name, kind }),
            });
            onSaved(result.subject);
          } catch (e) {
            setError(e as Error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Name
          <input
            autoFocus
            required
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            placeholder="A person, place, or pet"
          />
        </label>
        <label>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="person">Person</option>
            <option value="place">Place</option>
            <option value="animal">Animal</option>
            <option value="organization">Organization</option>
          </select>
        </label>
        <ErrorNotice error={error} />
        <footer className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
export function History({
  record,
  onClose,
}: {
  record: MemoryRecord;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<
    {
      revision: number;
      operation: string;
      record: MemoryRecord;
      created_at: string;
    }[]
  >([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    api<{ history: typeof history }>(`/api/records/${record.id}/history`)
      .then((data) => setHistory(data.history))
      .catch(setError);
  }, [record.id]);
  return (
    <Dialog title="Memory history" onClose={onClose}>
      <p className="dialog-intro">{attributeLabel(record.attribute)}</p>
      <ErrorNotice error={error} />
      <ol className="history">
        {history.map((entry) => (
          <li key={entry.revision}>
            <div className="history-marker">
              <Clock3 size={16} />
            </div>
            <div>
              <strong>
                {entry.operation === "create"
                  ? "Added"
                  : entry.operation === "retract"
                    ? "Retracted"
                    : "Updated"}
              </strong>
              <small>
                {date(entry.created_at)} · Revision {entry.revision}
              </small>
              <pre>
                {displayValue(entry.record.value)}
                {entry.record.unit ? ` ${entry.record.unit}` : ""}
              </pre>
            </div>
          </li>
        ))}
      </ol>
      {!history.length && !error && (
        <p className="muted" role="status">
          Loading history…
        </p>
      )}
    </Dialog>
  );
}
