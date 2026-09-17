import { useState, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Heart,
  Leaf,
  MapPin,
  Plus,
  Ruler,
  Search,
  StickyNote,
  UserRound,
  Users,
} from "lucide-react";
import { api } from "../api";
import {
  categories,
  initialForm,
  recordInput,
  type MemoryRecord,
  type Subject,
  type FormValue,
} from "../model";
import {
  fieldPresets,
  findPreset,
  attributeLabel,
  type FieldPreset,
} from "../fields";
import { StructuredEditor } from "../StructuredValue";
import { Dialog } from "./ui/dialog";
import { ErrorNotice } from "./ErrorNotice";
const icons: Record<string, typeof UserRound> = {
  profile: UserRound,
  measurements: Ruler,
  health: Heart,
  people: Users,
  places: MapPin,
  notes: StickyNote,
};
export function MemoryForm({
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
