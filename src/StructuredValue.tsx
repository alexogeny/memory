import { useEffect, useState } from "react";
import { displayValue } from "./model";
const label = (key: string) =>
  key.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
export function StructuredValue({
  value,
  unit,
}: {
  value: unknown;
  unit?: string | null;
}) {
  if (value === null || typeof value !== "object")
    return (
      <>
        {displayValue(value)}
        {unit && <span className="unit">{unit}</span>}
      </>
    );
  if (Array.isArray(value))
    return (
      <ul className="value-list">
        {value.map((item, index) => (
          <li key={index}>
            <StructuredValue value={item} />
          </li>
        ))}
      </ul>
    );
  const object = value as Record<string, unknown>;
  if (typeof object.value === "number")
    return (
      <>
        <span>
          {object.approximate === true ? "≈ " : ""}
          {object.value}
        </span>
        <span className="unit">
          {typeof object.unit === "string" ? object.unit : unit}
        </span>
        {Object.keys(object).some(
          (key) => !["value", "unit", "approximate"].includes(key),
        ) && (
          <dl className="object-value">
            {Object.entries(object)
              .filter(
                ([key]) => !["value", "unit", "approximate"].includes(key),
              )
              .map(([key, item]) => (
                <div key={key}>
                  <dt>{label(key)}</dt>
                  <dd>
                    <StructuredValue value={item} />
                  </dd>
                </div>
              ))}
          </dl>
        )}
      </>
    );
  return (
    <dl className="object-value">
      {Object.entries(object).map(([key, item]) => (
        <div key={key}>
          <dt>{label(key)}</dt>
          <dd>
            <StructuredValue value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function StructuredEditor({
  value,
  onChange,
  name = "Value",
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  name?: string;
}) {
  if (Array.isArray(value))
    return (
      <div className="structured-editor">
        {value.map((item, index) => (
          <div className="array-item" key={index}>
            <StructuredEditor
              value={item}
              onChange={(replacement) =>
                onChange(
                  value.map((current, i) =>
                    i === index ? replacement : current,
                  ),
                )
              }
            />
            <button
              type="button"
              className="remove-item"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              aria-label={`Remove item ${index + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button secondary"
          onClick={() => onChange([...value, ""])}
        >
          Add item
        </button>
      </div>
    );
  if (value !== null && typeof value === "object")
    return (
      <div className="structured-editor">
        {Object.entries(value).map(([key, item]) => (
          <div className="structured-field" key={key}>
            <span>{label(key)}</span>
            <StructuredEditor
              name={label(key)}
              value={item}
              onChange={(replacement) =>
                onChange({ ...value, [key]: replacement })
              }
            />
          </div>
        ))}
      </div>
    );
  if (typeof value === "boolean")
    return (
      <select
        aria-label={name}
        value={String(value)}
        onChange={(e) => onChange(e.target.value === "true")}
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  if (typeof value === "number")
    return <NumberField name={name} value={value} onChange={onChange} />;
  return (
    <input
      aria-label={name}
      value={value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NumberField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      aria-label={name}
      type="number"
      step="any"
      required
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (next.trim() && Number.isFinite(Number(next)))
          onChange(Number(next));
      }}
    />
  );
}
