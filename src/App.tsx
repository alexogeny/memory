import {
  useEffect,
  useRef,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Heart,
  House,
  Leaf,
  MapPin,
  Moon,
  MoreHorizontal,
  Plus,
  Ruler,
  Search,
  Settings2,
  Sparkles,
  StickyNote,
  Sun,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { api, ApiError } from "./api";
import {
  categories,
  displayValue,
  initialForm,
  recordInput,
  overviewCollection,
  type MemoryRecord,
  type Subject,
  type FormValue,
} from "./model";
import {
  fieldPresets,
  findPreset,
  attributeLabel,
  type FieldPreset,
} from "./fields";
import { downloadMarkdown, type ExportData } from "./export";
import { StructuredValue, StructuredEditor } from "./StructuredValue";
const icons: Record<string, typeof UserRound> = {
  profile: UserRound,
  measurements: Ruler,
  health: Heart,
  people: Users,
  places: MapPin,
  notes: StickyNote,
};
const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
function ErrorNotice({
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
function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? "dialog wide" : "dialog"}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
function MemoryForm({
  record,
  subject,
  category,
  subjects,
  onClose,
  onSaved,
}: {
  record?: MemoryRecord;
  subject: string;
  category: string;
  subjects: Subject[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormValue>(() =>
    initialForm(subject, category, record),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [browse, setBrowse] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [rawJson, setRawJson] = useState(false);
  const [choosing, setChoosing] = useState(!record);
  const preset = findPreset(form.category, form.attribute);
  const applyPreset = (field: FieldPreset) => {
    setForm((previous) => ({
      ...previous,
      category: field.category,
      attribute: field.attribute,
      value_type: field.type,
      value: field.shape
        ? JSON.stringify(field.shape, null, 2)
        : previous.value,
      unit: field.unit || "",
      kind: field.observation ? "observation" : "fact",
      observed_at: "",
    }));
    setBrowse(false);
    setChoosing(false);
  };
  let structured: unknown;
  try {
    structured = JSON.parse(form.value);
  } catch {
    structured = undefined;
  }
  const set = (key: keyof FormValue, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const input = recordInput(form);
      setBusy(true);
      await api(record ? `/api/records/${record.id}` : "/api/records", {
        method: record ? "PATCH" : "POST",
        body: JSON.stringify({
          ...input,
          ...(record ? { expected_revision: record.revision } : {}),
        }),
      });
      onSaved();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  if (choosing)
    return (
      <Dialog title="What would you like to remember?" onClose={onClose}>
        <p className="dialog-intro">Choose a field, or make your own.</p>
        <label className="picker-search">
          <Search size={18} />
          <input
            autoFocus
            aria-label="Search available fields"
            placeholder="Search birthdays, health, places…"
            value={fieldSearch}
            onChange={(event) => setFieldSearch(event.target.value)}
          />
        </label>
        <div className="picker-topics" aria-label="Field categories">
          {[
            { id: "profile", name: "You" },
            { id: "appearance", name: "Body" },
            { id: "health", name: "Health" },
            { id: "people", name: "People" },
            { id: "places", name: "Places" },
            { id: "notes", name: "Everyday" },
          ].map((topic) => (
            <button
              key={topic.id}
              className={form.category === topic.id ? "selected" : ""}
              onClick={() => {
                set("category", topic.id);
                setFieldSearch("");
              }}
            >
              {topic.name}
            </button>
          ))}
        </div>
        <div className="preset-picker">
          {fieldPresets
            .filter((field) =>
              fieldSearch
                ? `${field.name} ${field.group}`
                    .toLowerCase()
                    .includes(fieldSearch.toLowerCase())
                : field.category === form.category,
            )
            .sort((a, b) => {
              if (fieldSearch) return 0;
              const priority = [
                "Preferred name",
                "Birthday",
                "Birthplace",
                "Height",
                "Weight",
                "Blood type",
                "Allergy",
                "Medication",
                "Relationship",
                "Home address",
                "Place lived",
                "Favourite food",
              ];
              const rank = (name: string) => {
                const index = priority.indexOf(name);
                return index < 0 ? 100 : index;
              };
              return rank(a.name) - rank(b.name);
            })
            .slice(0, fieldSearch ? 24 : 8)
            .map((field) => {
              const Icon = icons[field.category] || Leaf;
              return (
                <button
                  key={`${field.category}-${field.attribute}`}
                  onClick={() => applyPreset(field)}
                >
                  <span className="picker-icon">
                    <Icon size={19} />
                  </span>
                  <span>
                    <strong>{field.name}</strong>
                    <small>{field.group}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
        </div>
        <button
          className="custom-field-button"
          onClick={() => setChoosing(false)}
        >
          <Plus size={17} />
          <span>Custom field</span>
          <small>Anything else you want to keep</small>
          <ChevronRight size={16} />
        </button>
      </Dialog>
    );
  return (
    <Dialog title={record ? "Edit memory" : "A new memory"} onClose={onClose}>
      <p className="dialog-intro">
        Add the value below. Change the details only if you need to.
      </p>
      <form onSubmit={save} className="memory-form">
        <label>
          Field name
          <input
            required
            autoFocus
            value={attributeLabel(form.attribute)}
            onChange={(e) => {
              const found = findPreset(form.category, e.target.value);
              if (found) applyPreset(found);
              else set("attribute", e.target.value);
            }}
            placeholder="What would you like to remember?"
            list="field-presets"
            maxLength={120}
          />
          <datalist id="field-presets">
            {fieldPresets
              .filter((field) => field.category === form.category)
              .map((field) => (
                <option key={field.name} value={field.name} />
              ))}
          </datalist>
        </label>
        <div className="presets" aria-label="Suggested fields">
          {fieldPresets
            .filter((field) => field.category === form.category)
            .slice(0, 3)
            .map((field) => (
              <button
                key={field.name}
                type="button"
                onClick={() => applyPreset(field)}
              >
                {field.name}
              </button>
            ))}
          <button
            type="button"
            className="browse-fields"
            onClick={() => setBrowse((value) => !value)}
          >
            <Search size={12} />
            Browse fields
          </button>
        </div>
        {browse && (
          <section className="field-browser">
            <input
              aria-label="Search available fields"
              placeholder="Search identity, health, hobbies…"
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
            />
            <div className="field-results">
              {[
                ...new Set(
                  fieldPresets
                    .filter((field) =>
                      fieldSearch
                        ? `${field.name} ${field.group}`
                            .toLowerCase()
                            .includes(fieldSearch.toLowerCase())
                        : field.category === form.category,
                    )
                    .map((field) => field.group),
                ),
              ].map((group) => (
                <div key={group}>
                  <h3>{group}</h3>
                  {fieldPresets
                    .filter(
                      (field) =>
                        field.group === group &&
                        (!fieldSearch ||
                          `${field.name} ${field.group}`
                            .toLowerCase()
                            .includes(fieldSearch.toLowerCase())),
                    )
                    .map((field) => (
                      <button
                        key={field.name}
                        type="button"
                        onClick={() => applyPreset(field)}
                      >
                        {field.name}
                        <Plus size={13} />
                      </button>
                    ))}
                </div>
              ))}
            </div>
            <p>Or enter any custom field name above.</p>
          </section>
        )}
        {preset?.help && <p className="field-help">{preset.help}</p>}
        <div className="form-row value-options">
          <label>
            Value type
            <select
              value={form.value_type}
              onChange={(e) => set("value_type", e.target.value)}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="json">JSON</option>
            </select>
          </label>
          {(form.category === "measurements" ||
            form.value_type === "number" ||
            form.unit) && (
            <label>
              Unit <span className="optional">optional</span>
              <input
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="e.g. cm"
              />
            </label>
          )}
        </div>
        <div className="value-field">
          <label>Value</label>
          {form.value_type === "json" &&
          structured !== null &&
          typeof structured === "object" &&
          !rawJson ? (
            <StructuredEditor
              value={structured}
              onChange={(value) => set("value", JSON.stringify(value, null, 2))}
            />
          ) : form.value_type === "text" || form.value_type === "json" ? (
            <textarea
              aria-label="Value"
              required
              rows={form.value_type === "json" ? 5 : 3}
              className={form.value_type === "json" ? "code" : ""}
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder={
                form.value_type === "json"
                  ? "An object, array, or other JSON value"
                  : "Add the detail here…"
              }
            />
          ) : (
            <input
              aria-label="Value"
              required
              type={form.value_type === "date" ? "date" : "number"}
              step="any"
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
            />
          )}
          {form.value_type === "json" &&
            structured !== null &&
            typeof structured === "object" && (
              <button
                type="button"
                className="text-button"
                onClick={() => setRawJson((value) => !value)}
              >
                {rawJson ? "Edit individual fields" : "Edit as JSON"}
              </button>
            )}
        </div>
        {form.kind === "observation" && (
          <label>
            Observed on{" "}
            <span className="optional">optional · leave empty if unknown</span>
            <input
              type="date"
              value={form.observed_at.slice(0, 10)}
              onChange={(e) => set("observed_at", e.target.value)}
            />
          </label>
        )}
        {form.category === "places" && (
          <div className="form-row">
            <label>
              From <span className="optional">optional</span>
              <input
                type="date"
                value={form.valid_from.slice(0, 10)}
                onChange={(e) => set("valid_from", e.target.value)}
              />
            </label>
            <label>
              Until <span className="optional">optional</span>
              <input
                type="date"
                value={form.valid_to.slice(0, 10)}
                onChange={(e) => set("valid_to", e.target.value)}
              />
            </label>
          </div>
        )}
        <details className="form-details">
          <summary>
            More details <span>Category & how it’s saved</span>
            <ChevronDown size={16} />
          </summary>
          <div className="detail-fields">
            {" "}
            <div className="form-row">
              <label>
                About
                <select
                  aria-label="About"
                  value={form.subject_id}
                  onChange={(e) => set("subject_id", e.target.value)}
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  aria-label="Category"
                  value={form.category}
                  onChange={(e) =>
                    setForm((previous) => ({
                      ...previous,
                      category: e.target.value,
                      attribute: "",
                      kind:
                        e.target.value === "measurements"
                          ? "observation"
                          : "fact",
                      observed_at:
                        e.target.value === "measurements"
                          ? new Date().toISOString().slice(0, 10)
                          : "",
                      value_type:
                        e.target.value === "measurements" ? "number" : "text",
                    }))
                  }
                >
                  {!categories.some((c) => c.id === form.category) && (
                    <option value={form.category}>
                      {attributeLabel(form.category)}
                    </option>
                  )}
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Save as
              <select
                aria-label="Save as"
                value={form.kind}
                onChange={(e) =>
                  setForm((previous) => ({
                    ...previous,
                    kind: e.target.value,
                    observed_at:
                      e.target.value === "fact"
                        ? ""
                        : previous.observed_at ||
                          new Date().toISOString().slice(0, 10),
                  }))
                }
              >
                <option value="fact">A detail · keep the latest value</option>
                <option value="observation">
                  An observation · keep each dated value
                </option>
              </select>
            </label>
          </div>
        </details>
        <ErrorNotice error={error} />
        <footer className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              "Saving…"
            ) : (
              <>
                <Check size={17} />
                Save memory
              </>
            )}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
function AddSubject({
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
function History({
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
function Settings({
  onClose,
  onImported,
  theme,
  setTheme,
}: {
  onClose: () => void;
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
  return (
    <Dialog title="Settings" onClose={onClose}>
      <section className="settings-section">
        <h3>Make yourself at home</h3>
        <p className="muted">Choose your appearance.</p>
        <div className="theme-options">
          {[
            { id: "light", name: "Light", Icon: Sun },
            { id: "dark", name: "Dark", Icon: Moon },
            { id: "system", name: "System", Icon: Settings2 },
          ].map(({ id, name, Icon }) => (
            <button
              className={theme === id ? "selected" : ""}
              key={id}
              aria-pressed={theme === id}
              onClick={() => setTheme(id)}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h3>Your memories, with you</h3>
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
      <a className="sign-out" href="/cdn-cgi/access/logout">
        Sign out
      </a>
    </Dialog>
  );
}
export default function App() {
  const [subjects, setSubjects] = useState<Subject[]>([
    { id: "self", name: "Me", kind: "person" },
  ]);
  const [subject, setSubject] = useState("self");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<MemoryRecord | "new" | null>(null);
  const [history, setHistory] = useState<MemoryRecord | null>(null);
  const [retract, setRetract] = useState<MemoryRecord | null>(null);
  const [retractBusy, setRetractBusy] = useState(false);
  const [retractError, setRetractError] = useState<Error | null>(null);
  const [settings, setSettings] = useState(false);
  const [addSubject, setAddSubject] = useState(false);
  const [toast, setToast] = useState("");
  const [allCategories, setAllCategories] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("memory-theme") || "system",
  );
  const requestId = useRef(0);
  useEffect(() => {
    const expire = (event: Event) => {
      requestId.current++;
      setRecords([]);
      setSubjects([{ id: "self", name: "Me", kind: "person" }]);
      setEditor(null);
      setHistory(null);
      setRetract(null);
      setSettings(false);
      setAddSubject(false);
      setLoading(false);
      setError((event as CustomEvent<Error>).detail);
    };
    window.addEventListener("memory-session-expired", expire);
    return () => window.removeEventListener("memory-session-expired", expire);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("memory-theme", theme);
  }, [theme]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    api<{ subjects: Subject[] }>("/api/subjects")
      .then((data) => setSubjects(data.subjects))
      .catch(setError);
  }, [revision]);
  async function load(more = false) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ subject_id: subject, limit: "60" });
    if (category !== "all") params.set("category", category);
    if (query) params.set("q", query);
    if (more && cursor) params.set("cursor", cursor);
    try {
      const data = await api<{
        records: MemoryRecord[];
        next_cursor: string | null;
      }>(`/api/records?${params}`);
      if (id !== requestId.current) return;
      setRecords((previous) =>
        more ? [...previous, ...data.records] : data.records,
      );
      setCursor(data.next_cursor);
    } catch (e) {
      if (id === requestId.current) setError(e as Error);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    setRecords([]);
    setCursor(null);
    void load();
    return () => {
      requestId.current++;
    };
  }, [subject, category, query, revision]);
  const overview = overviewCollection(records);
  const current = subjects.find((s) => s.id === subject);
  const selected = categories.find((c) => c.id === category);
  const visibleGroups =
    category === "all"
      ? [
          ...categories.map((c) => c.id),
          ...new Set(
            records
              .map((r) => r.category)
              .filter((c) => !categories.some((known) => known.id === c)),
          ),
        ]
      : [category];
  const refresh = () => setRevision((value) => value + 1);
  return (
    <div className="app">
      <aside className="sidebar">
        <a href="/" className="brand" aria-label="Memory home">
          <span className="brand-mark">
            <Leaf size={25} />
          </span>
          memory<span className="brand-dot">.</span>
        </a>
        <div className="sidebar-caption">A little space for your life</div>
        <div className="subject-box">
          <span className="avatar">
            <UserRound size={20} />
          </span>
          <label className="subject-label">
            <span>Remembering</span>
            <select
              aria-label="Remembering"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="Add a person or place"
            onClick={() => setAddSubject(true)}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="nav-caption">YOUR COLLECTION</div>
        <nav className="navigation" aria-label="Memory categories">
          <button
            className={category === "all" ? "active" : ""}
            onClick={() => setCategory("all")}
          >
            <House size={19} />
            All memories
          </button>
          {categories.slice(0, 6).map((c) => {
            const Icon = icons[c.id] || StickyNote;
            return (
              <button
                key={c.id}
                className={category === c.id ? "active" : ""}
                onClick={() => setCategory(c.id)}
              >
                <Icon size={19} />
                {c.name}
              </button>
            );
          })}
          <label className="extra-categories">
            <span className="visually-hidden">More categories</span>
            <select
              aria-label="More categories"
              value={
                categories.slice(6).some((c) => c.id === category)
                  ? category
                  : ""
              }
              onChange={(e) => {
                if (e.target.value) setCategory(e.target.value);
              }}
            >
              <option value="">More categories…</option>
              {categories.slice(6).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <Sparkles size={19} />
            <p>
              Life is full of little details.
              <br />
              Give them a place to stay.
            </p>
          </div>
          <button className="settings-button" onClick={() => setSettings(true)}>
            <Settings2 size={18} />
            Settings
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span className="breadcrumb">
            My space <ChevronRight size={14} />{" "}
            <strong>{selected?.name || "All memories"}</strong>
          </span>
          <span className="private-label">
            <span />
            Your personal collection
          </span>
          <button
            className="mobile-settings icon-button"
            aria-label="Settings"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={20} />
          </button>
        </header>
        <div className="content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                {current?.name === "Me"
                  ? "A PLACE TO REMEMBER"
                  : `REMEMBERING ${current?.name || ""}`}
              </div>
              <h1>{selected?.name || "Your collection"}</h1>
              <p>
                {selected?.description ||
                  "Find a detail. Add a memory. Pick up where you left off."}
              </p>
            </div>
            <button
              className="button primary new-memory"
              onClick={() => setEditor("new")}
            >
              <Plus size={18} />
              New memory
            </button>
          </section>
          <div className="search-row">
            <label className="search">
              <Search size={19} />
              <input
                type="search"
                aria-label="Search memories"
                placeholder="Find a memory…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="icon-button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X size={16} />
                </button>
              )}
            </label>
            <span className="record-count">
              {loading
                ? "Loading…"
                : `${records.length}${cursor ? "+" : ""} ${records.length === 1 ? "memory" : "memories"}`}
            </span>
          </div>
          <div className="mobile-filters">
            <label>
              <span className="visually-hidden">About</span>
              <select
                aria-label="About"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button"
              aria-label="Add a person or place"
              onClick={() => setAddSubject(true)}
            >
              <Plus size={18} />
            </button>
            <div className="category-chips">
              <button
                className={category === "all" ? "selected" : ""}
                onClick={() => setCategory("all")}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  className={category === c.id ? "selected" : ""}
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <ErrorNotice error={error} retry={() => void load()} />
          {loading && !records.length ? (
            <div
              className="loading-grid"
              aria-label="Loading memories"
              role="status"
            >
              {[1, 2, 3].map((n) => (
                <div key={n} className="skeleton" />
              ))}
            </div>
          ) : !records.length && !error ? (
            <section className="empty-state">
              <div className="empty-art" aria-hidden="true">
                <div className="art-orbit" />
                <div className="art-card back" />
                <div className="art-card front">
                  <Leaf size={36} />
                  <span />
                  <span />
                </div>
                <Sparkles className="art-spark" size={25} />
                <span className="art-dot" />
              </div>
              <span className="eyebrow">
                {query ? "A FRESH SEARCH" : "ROOM FOR YOUR STORY"}
              </span>
              <h2>
                {query ? "No memories found." : "Start with one little detail."}
              </h2>
              <p>
                {query
                  ? "Try another word, or look in a different category."
                  : "A birthday. A measurement. A place you called home. Save something now, find it when you need it."}
              </p>
              <button
                className="button primary"
                onClick={() => (query ? setSearch("") : setEditor("new"))}
              >
                {query ? (
                  "Clear search"
                ) : (
                  <>
                    <Plus size={17} />
                    Add your first memory
                  </>
                )}
              </button>
              {!query && (
                <div className="empty-suggestions">
                  <span>Make it yours</span>
                  {[
                    {
                      id: "profile",
                      label: "A personal detail",
                      Icon: UserRound,
                    },
                    { id: "measurements", label: "A measurement", Icon: Ruler },
                    { id: "places", label: "A place you lived", Icon: MapPin },
                  ].map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => {
                        setCategory(id);
                        setEditor("new");
                      }}
                    >
                      <Icon size={16} />
                      {label}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : category === "all" && !query ? (
            <div className="collection-overview">
              <div className="collection-stats">
                <span>
                  <strong>
                    {records.length}
                    {cursor ? "+" : ""}
                  </strong>{" "}
                  saved details
                </span>
                <span>
                  <strong>{overview.categories.length}</strong> categories
                </span>
                <button onClick={() => setAddSubject(true)}>
                  <Users size={15} />
                  <strong>{subjects.length}</strong>{" "}
                  {subjects.length === 1 ? "subject" : "subjects"}
                  <Plus size={14} />
                </button>
              </div>
              <section aria-label="Explore your collection">
                <div className="overview-section-heading">
                  <h2>Find your way</h2>
                  <span>Choose a category</span>
                </div>
                <div className="category-tiles">
                  {overview.categories
                    .slice(0, allCategories ? undefined : 6)
                    .map((group) => {
                      const config = categories.find((c) => c.id === group.id);
                      const Icon = icons[group.id] || Leaf;
                      return (
                        <button
                          className={`category-tile category-${group.id}`}
                          key={group.id}
                          onClick={() => setCategory(group.id)}
                        >
                          <div>
                            <span className="category-icon">
                              <Icon size={20} />
                            </span>
                            <span className="tile-count">{group.count}</span>
                          </div>
                          <h3>{config?.name || attributeLabel(group.id)}</h3>
                          <p>{group.preview.map(attributeLabel).join(" · ")}</p>
                          <ChevronRight className="tile-arrow" size={17} />
                        </button>
                      );
                    })}
                </div>
                {overview.categories.length > 6 && (
                  <button
                    className="show-categories"
                    onClick={() => setAllCategories((value) => !value)}
                  >
                    {allCategories
                      ? "Show fewer categories"
                      : `Show all ${overview.categories.length} categories`}
                    <ChevronDown size={15} />
                  </button>
                )}
              </section>
              <section className="recent-section" aria-label="Recently updated">
                <div className="overview-section-heading">
                  <h2>Recently updated</h2>
                  <Clock3 size={16} />
                </div>
                <div className="recent-list">
                  {overview.recent.map((record) => {
                    const Icon = icons[record.category] || Leaf;
                    return (
                      <button
                        className="recent-memory"
                        key={record.id}
                        onClick={() => setEditor(record)}
                        aria-label={`Edit ${attributeLabel(record.attribute)}`}
                      >
                        <span className="recent-icon">
                          <Icon size={18} />
                        </span>
                        <span className="recent-label">
                          <strong>{attributeLabel(record.attribute)}</strong>
                          <small>
                            {categories.find((c) => c.id === record.category)
                              ?.name || attributeLabel(record.category)}{" "}
                            · {date(record.updated_at)}
                          </small>
                        </span>
                        <span className="recent-preview">
                          {typeof record.value === "object"
                            ? "View details"
                            : String(record.value)}
                          {record.unit ? ` ${record.unit}` : ""}
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    );
                  })}
                </div>
              </section>
              {cursor && (
                <button
                  className="button secondary load-more"
                  onClick={() => void load(true)}
                  disabled={loading}
                >
                  {loading ? "Loading…" : "Load remaining categories"}
                </button>
              )}
            </div>
          ) : (
            <div className="memory-groups">
              {visibleGroups.map((group) => {
                const groupRecords = records.filter(
                  (record) => record.category === group,
                );
                if (!groupRecords.length) return null;
                const config = categories.find((c) => c.id === group);
                const Icon = icons[group as keyof typeof icons] || StickyNote;
                return (
                  <section
                    key={group}
                    className={`memory-group category-${group}`}
                  >
                    <header className="group-header">
                      <span className="category-icon">
                        <Icon size={17} />
                      </span>
                      <h2>{config?.name || group}</h2>
                      <span>{groupRecords.length}</span>
                      <button
                        className="icon-button"
                        aria-label={`Add ${config?.name || group} memory`}
                        onClick={() => {
                          setCategory(group);
                          setEditor("new");
                        }}
                      >
                        <Plus size={17} />
                      </button>
                    </header>
                    <div className="card-grid">
                      {groupRecords.map((record) => (
                        <article className="memory-card" key={record.id}>
                          <div className="card-heading">
                            <h3>{attributeLabel(record.attribute)}</h3>
                            <button
                              className="icon-button"
                              aria-label={`Edit ${attributeLabel(record.attribute)}`}
                              onClick={() => setEditor(record)}
                            >
                              <MoreHorizontal size={19} />
                            </button>
                          </div>
                          <div
                            className={
                              typeof record.value === "object"
                                ? "memory-value structured"
                                : "memory-value"
                            }
                          >
                            <StructuredValue
                              value={record.value}
                              unit={record.unit}
                            />
                          </div>
                          {record.valid_from && (
                            <p className="date-range">
                              <MapPin size={13} />
                              {date(record.valid_from)} —{" "}
                              {record.valid_to
                                ? date(record.valid_to)
                                : "Present"}
                            </p>
                          )}
                          <footer className="card-footer">
                            <span>
                              <span className="tiny-dot" />
                              {record.observed_at
                                ? date(record.observed_at)
                                : `Updated ${date(record.updated_at)}`}
                            </span>
                            <div>
                              <button
                                className="icon-button"
                                aria-label={`History of ${attributeLabel(record.attribute)}`}
                                onClick={() => setHistory(record)}
                              >
                                <Clock3 size={15} />
                              </button>
                              <button
                                className="icon-button retract-button"
                                aria-label={`Retract ${attributeLabel(record.attribute)}`}
                                onClick={() => {
                                  setRetractError(null);
                                  setRetract(record);
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </footer>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
              {cursor && (
                <button
                  className="button secondary load-more"
                  disabled={loading}
                  onClick={() => void load(true)}
                >
                  {loading ? "Loading…" : "Load more memories"}
                  <ChevronDown size={17} />
                </button>
              )}
            </div>
          )}
          <footer className="page-footer">
            <Leaf size={13} />
            <span>A little less to hold in your head.</span>
          </footer>
        </div>
      </main>
      {editor && (
        <MemoryForm
          record={editor === "new" ? undefined : editor}
          subject={subject}
          category={category === "all" ? "profile" : category}
          subjects={subjects}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setToast("Memory saved");
            refresh();
          }}
        />
      )}
      {addSubject && (
        <AddSubject
          onClose={() => setAddSubject(false)}
          onSaved={(s) => {
            setSubjects((previous) => [...previous, s]);
            setSubject(s.id);
            setAddSubject(false);
            setToast("Added to your space");
          }}
        />
      )}
      {history && <History record={history} onClose={() => setHistory(null)} />}{" "}
      {settings && (
        <Settings
          theme={theme}
          setTheme={setTheme}
          onClose={() => setSettings(false)}
          onImported={refresh}
        />
      )}{" "}
      {retract && (
        <Dialog title="Retract this memory?" onClose={() => setRetract(null)}>
          <p className="dialog-intro">
            “{attributeLabel(retract.attribute)}” will be removed from your
            collection. Its previous versions stay in your exported history.
          </p>
          <ErrorNotice error={retractError} />
          <footer className="dialog-footer">
            <button
              className="button secondary"
              onClick={() => setRetract(null)}
            >
              Keep memory
            </button>
            <button
              className="button danger"
              disabled={retractBusy}
              onClick={async () => {
                setRetractBusy(true);
                try {
                  await api(`/api/records/${retract.id}`, {
                    method: "DELETE",
                    body: JSON.stringify({
                      expected_revision: retract.revision,
                    }),
                  });
                  setRetract(null);
                  setToast("Memory retracted");
                  refresh();
                } catch (e) {
                  setRetractError(e as Error);
                } finally {
                  setRetractBusy(false);
                }
              }}
            >
              {retractBusy ? "Retracting…" : "Retract memory"}
            </button>
          </footer>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
