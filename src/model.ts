export type Category = string;
export type Subject = {
  id: string;
  name: string;
  kind: "person" | "place" | "animal" | "organization";
};
export type MemoryRecord = {
  id: string;
  subject_id: string;
  category: string;
  attribute: string;
  kind: "fact" | "observation";
  value: unknown;
  unit: string | null;
  observed_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type FormValue = {
  subject_id: string;
  category: string;
  attribute: string;
  kind: string;
  value: string;
  value_type: string;
  unit: string;
  observed_at: string;
  valid_from: string;
  valid_to: string;
};
export const categories: {
  id: Category;
  name: string;
  description: string;
  fields: string[];
}[] = [
  {
    id: "profile",
    name: "Profile",
    description: "The details that make you, you.",
    fields: [
      "Preferred name",
      "Birthday",
      "Occupation",
      "Pronouns",
      "Languages",
    ],
  },
  {
    id: "measurements",
    name: "Measurements",
    description: "A little perspective over time.",
    fields: ["Height", "Weight", "Shoe size", "Clothing size"],
  },
  {
    id: "health",
    name: "Health",
    description: "Useful details, close at hand.",
    fields: [
      "Allergy",
      "Medication",
      "Condition",
      "Blood type",
      "Care provider",
    ],
  },
  {
    id: "people",
    name: "People",
    description: "Remember the people in your life.",
    fields: ["Relationship", "Birthday", "Contact", "Preference"],
  },
  {
    id: "places",
    name: "Places",
    description: "The places that are part of your story.",
    fields: ["Home address", "Place lived", "Favourite place", "Workplace"],
  },
  {
    id: "notes",
    name: "Notes",
    description: "A home for everything else.",
    fields: ["Note", "Preference", "Idea", "Milestone"],
  },
  ...[
    { id: "appearance", name: "Appearance" },
    { id: "family", name: "Family & heritage" },
    { id: "relationships", name: "Relationships" },
    { id: "preferences", name: "Preferences" },
    { id: "style", name: "Style" },
    { id: "food", name: "Food & drink" },
    { id: "music", name: "Music" },
    { id: "education", name: "Education" },
    { id: "work", name: "Work" },
    { id: "projects", name: "Projects" },
    { id: "development", name: "Development & tools" },
    { id: "social", name: "Social" },
    { id: "games", name: "Games" },
    { id: "homelab", name: "Homelab" },
  ].map((category) => ({
    ...category,
    description: "Keep the details that matter to you.",
    fields: [],
  })),
];
export function parseValue(value: string, type: string): unknown {
  if (type === "number") {
    if (!value.trim() || !Number.isFinite(Number(value)))
      throw new Error("Enter a finite number.");
    return Number(value);
  }
  if (type === "json") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("Enter valid JSON.");
    }
  }
  if (!value.trim()) throw new Error("Add a value for this memory.");
  return value.trim();
}
export function recordInput(form: FormValue) {
  if (!form.attribute.trim()) throw new Error("Add a field name.");
  if (form.valid_from && form.valid_to && form.valid_to < form.valid_from)
    throw new Error("End date must be after the start date.");
  return {
    subject_id: form.subject_id,
    category: form.category,
    attribute: form.attribute.trim(),
    kind: form.kind as "fact" | "observation",
    value: parseValue(form.value, form.value_type),
    unit: form.unit.trim() || null,
    observed_at: form.observed_at || null,
    valid_from: form.valid_from || null,
    valid_to: form.valid_to || null,
  };
}
export function displayValue(value: unknown) {
  return typeof value === "object"
    ? JSON.stringify(value, null, 2)
    : String(value);
}
export function initialForm(
  subject_id: string,
  category: string,
  record?: MemoryRecord,
): FormValue {
  if (record)
    return {
      ...record,
      value: displayValue(record.value),
      value_type:
        typeof record.value === "number"
          ? "number"
          : typeof record.value === "string"
            ? "text"
            : "json",
      unit: record.unit || "",
      observed_at: record.observed_at || "",
      valid_from: record.valid_from || "",
      valid_to: record.valid_to || "",
    };
  return {
    subject_id,
    category,
    attribute: "",
    kind: category === "measurements" ? "observation" : "fact",
    value: "",
    value_type: category === "measurements" ? "number" : "text",
    unit: "",
    observed_at:
      category === "measurements" ? new Date().toISOString().slice(0, 10) : "",
    valid_from: "",
    valid_to: "",
  };
}

export function overviewCollection(records: MemoryRecord[]) {
  const grouped = new Map<
    string,
    { id: string; count: number; preview: string[] }
  >();
  for (const record of records) {
    let category = grouped.get(record.category);
    if (!category) {
      category = { id: record.category, count: 0, preview: [] };
      grouped.set(record.category, category);
    }
    category.count++;
    if (
      category.preview.length < 2 &&
      !category.preview.includes(record.attribute)
    )
      category.preview.push(record.attribute);
  }
  return {
    categories: [...grouped.values()],
    recent: [...records]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 4),
  };
}
