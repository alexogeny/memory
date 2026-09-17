import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type Row = Record<string, any>;

function timestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new Error("Invalid source timestamp");
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date(value).toISOString();
}

export function convertLocum(state: Row) {
  if (
    state.schema_version !== 2 ||
    !state.records ||
    !state.subjects ||
    !state.history
  )
    throw new Error("Expected Locum canonical memory version 2");
  const subjects = Object.entries(state.subjects as Record<string, Row>).map(
    ([id, subject]) => ({
      id,
      name: id === "self" ? "Me" : subject.name,
      kind: id === "self" ? "person" : subject.kind,
    }),
  );
  const histories: Row[] = [];
  const records: Row[] = [];
  const convert = (source: Row, createdAt: string) => ({
    id: source.id,
    subject_id: source.subject_id,
    category: source.category,
    attribute: source.key,
    kind: source.mode,
    value: source.value,
    unit:
      source.value &&
      typeof source.value === "object" &&
      typeof source.value.unit === "string"
        ? source.value.unit
        : null,
    observed_at: timestamp(source.observed_at),
    valid_from: timestamp(source.valid_from),
    valid_to: timestamp(source.valid_until),
    metadata: {
      source: "locum",
      original_text: source.text ?? null,
      source_ids: source.source_ids ?? [],
      as_of: timestamp(source.as_of),
      reported_at: timestamp(source.reported_at),
    },
    revision: source.revision,
    created_at: createdAt,
    updated_at: timestamp(source.recorded_at),
    retracted_at:
      source.status === "retracted" ? timestamp(source.recorded_at) : null,
  });
  for (const current of Object.values(state.records) as Row[]) {
    const versions: Row[] = [
      ...(state.history[current.id] ?? []),
      current,
    ].sort((a, b) => a.revision - b.revision);
    const createdAt = timestamp(versions[0].recorded_at);
    if (!createdAt) throw new Error("Source record has no recording timestamp");
    for (let index = 0; index < versions.length; index++) {
      const source = versions[index];
      if (source.revision !== index + 1)
        throw new Error("Source history is incomplete");
      const record = convert(source, createdAt);
      histories.push({
        record_id: record.id,
        revision: record.revision,
        operation: record.retracted_at
          ? "retract"
          : index === 0
            ? "create"
            : "update",
        record,
        created_at: record.updated_at,
      });
      if (index === versions.length - 1) records.push(record);
    }
  }
  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    subjects,
    records,
    history: histories,
  };
}

if (import.meta.main) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination)
    throw new Error(
      "Usage: bun scripts/locum-import.ts /private/locum/state.json /private/import.json",
    );
  const output = resolve(destination);
  const root = resolve(import.meta.dir, "..");
  if (output === root || output.startsWith(root + "/"))
    throw new Error("Write private imports outside the repository");
  const converted = convertLocum(JSON.parse(await readFile(source, "utf8")));
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(converted, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    `Prepared ${converted.records.length} records, ${converted.subjects.length} subjects, and ${converted.history.length} history entries.`,
  );
}
