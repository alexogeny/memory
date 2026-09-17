import type { MemoryRecord, Subject } from "./model";
export type ExportData = {
  subjects: Subject[];
  records: (MemoryRecord & { retracted_at?: string | null })[];
};
function readable(value: unknown): string {
  if (Array.isArray(value)) return value.map(readable).join("; ");
  if (value !== null && typeof value === "object")
    return Object.entries(value)
      .map(([key, item]) => `${key.replace(/_/g, " ")}: ${readable(item)}`)
      .join("; ");
  return String(value);
}
export function markdownExport(data: ExportData) {
  const lines = [
    "# Memory",
    "",
    `Exported ${new Date().toISOString().slice(0, 10)}`,
    "",
  ];
  for (const subject of data.subjects) {
    const records = data.records.filter(
      (record) => record.subject_id === subject.id && !record.retracted_at,
    );
    if (!records.length) continue;
    lines.push(`## ${subject.name.replace(/[\r\n]/g, " ")}`, "");
    for (const category of [
      ...new Set(records.map((record) => record.category)),
    ]) {
      lines.push(`### ${category.replace(/_/g, " ")}`, "");
      for (const record of records.filter(
        (record) => record.category === category,
      )) {
        lines.push(
          `**${record.attribute.replace(/[\r\n]/g, " ")}**`,
          "",
          `${readable(record.value)}${record.unit ? ` ${record.unit}` : ""}`,
          "",
        );
        if (record.observed_at)
          lines.push(`Observed: ${record.observed_at}`, "");
        if (record.valid_from || record.valid_to)
          lines.push(
            `Valid: ${record.valid_from || "Unknown"} to ${record.valid_to || "Present"}`,
            "",
          );
      }
    }
  }
  return lines.join("\n");
}
export function downloadMarkdown(data: ExportData) {
  const url = URL.createObjectURL(
    new Blob([markdownExport(data)], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `memory-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
