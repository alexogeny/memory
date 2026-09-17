export type FieldPreset = {
  name: string;
  attribute: string;
  category: string;
  group: string;
  type: "text" | "number" | "date" | "json";
  unit?: string;
  observation?: boolean;
  help?: string;
  shape?: Record<string, string>;
};
const groups: { category: string; group: string; names: string[] }[] = [
  {
    category: "profile",
    group: "Identity",
    names: [
      "Preferred name",
      "Full name",
      "Pronouns",
      "Nationality",
      "Citizenship",
      "Languages",
      "Cultural heritage",
      "Ancestry",
      "Birthplace",
    ],
  },
  {
    category: "appearance",
    group: "Appearance",
    names: [
      "Hair",
      "Eyes",
      "Skin",
      "Build",
      "Distinguishing features",
      "Tattoos",
      "Piercings",
    ],
  },
  {
    category: "profile",
    group: "Education & work",
    names: [
      "Occupation",
      "Employer",
      "Work location",
      "Working hours",
      "Education",
      "Qualification",
      "Institution",
      "Course of study",
      "Professional interests",
      "Skills",
      "Certifications",
    ],
  },
  {
    category: "measurements",
    group: "Clothing & fit",
    names: [
      "Clothing size",
      "Top size",
      "Bottom size",
      "Dress size",
      "Bra size",
      "Shoe size",
      "Ring size",
      "Hat size",
      "Sizing system",
      "Fit preference",
    ],
  },
  {
    category: "health",
    group: "Care",
    names: [
      "Blood type",
      "Condition",
      "Allergy",
      "Medication",
      "Medication dosage",
      "Supplement",
      "Care provider",
      "Clinic",
      "Pharmacy",
      "Emergency care instructions",
      "Surgery",
      "Vaccination",
      "Accessibility needs",
      "Sensory needs",
    ],
  },
  {
    category: "health",
    group: "Wellbeing",
    names: [
      "Sleep routine",
      "Exercise routine",
      "Activity preference",
      "Sleep quality",
      "Symptom",
      "Pain level",
      "Mood",
      "Recovery note",
    ],
  },
  {
    category: "people",
    group: "Family & relationships",
    names: [
      "Relationship",
      "Family connection",
      "Partner",
      "Parent",
      "Sibling",
      "Child",
      "Emergency contact",
      "Contact",
      "Important date",
      "Gift idea",
      "Shared activity",
      "Communication preference",
      "Boundaries",
    ],
  },
  {
    category: "places",
    group: "Places & residence",
    names: [
      "Home address",
      "Place lived",
      "Birthplace",
      "Workplace",
      "Favourite place",
      "Mailing address",
      "Travel destination",
      "Local area",
      "Moving note",
    ],
  },
  {
    category: "notes",
    group: "Everyday preferences",
    names: [
      "Communication style",
      "Preferred units",
      "Daily routine",
      "Social preference",
      "Favourite activity",
      "Hobby",
      "Reading preference",
      "Games",
      "Technology preference",
    ],
  },
  {
    category: "notes",
    group: "Food & drink",
    names: [
      "Favourite food",
      "Favourite drink",
      "Favourite cuisine",
      "Dietary preference",
      "Food dislikes",
      "Coffee order",
      "Tea preference",
      "Recipe",
      "Restaurant",
    ],
  },
  {
    category: "notes",
    group: "Music & style",
    names: [
      "Favourite artist",
      "Favourite album",
      "Favourite song",
      "Music genre",
      "Instrument",
      "Clothing style",
      "Favourite colours",
      "Preferred fabrics",
      "Accessories",
      "Jewellery",
    ],
  },
  {
    category: "notes",
    group: "Projects & plans",
    names: [
      "Project",
      "Goal",
      "Milestone",
      "Task note",
      "Idea",
      "Deadline",
      "Learning goal",
      "Travel plan",
      "Note",
    ],
  },
];
const definitions: Omit<FieldPreset, "attribute">[] = [
  ...groups.flatMap(({ category, group, names }) =>
    names.map((name) => ({ name, category, group, type: "text" as const })),
  ),
  ...["Birthday", "Graduation date", "Employment start date"].map((name) => ({
    name,
    category: "profile",
    group: "Dates",
    type: "date" as const,
  })),
  ...[
    "Height",
    "Chest",
    "Bust",
    "Underbust",
    "Waist",
    "Hips",
    "Shoulder width",
    "Arm length",
    "Inseam",
    "Thigh circumference",
    "Calf circumference",
    "Neck circumference",
    "Wrist circumference",
    "Foot length",
    "Foot width",
  ].map((name) => ({
    name,
    category: "appearance",
    group: "Body measurements",
    type: "number" as const,
    unit: "cm",
    observation: true,
    help: "Choose the unit you use. Leave the date empty if it is unknown.",
  })),
  ...[
    { name: "Weight", unit: "kg" },
    { name: "Body fat", unit: "%" },
    { name: "Resting heart rate", unit: "bpm" },
    { name: "Heart rate variability", unit: "ms" },
    { name: "Systolic blood pressure", unit: "mmHg" },
    { name: "Diastolic blood pressure", unit: "mmHg" },
    { name: "Body temperature", unit: "°C" },
    { name: "Blood oxygen", unit: "%" },
    { name: "VO2 max", unit: "mL/kg/min" },
    { name: "Sleep duration", unit: "hours" },
    { name: "Exercise duration", unit: "minutes" },
    { name: "Distance", unit: "km" },
    { name: "Steps", unit: "steps" },
  ].map((field) => ({
    ...field,
    category: "health",
    group: "Dated measurements",
    type: "number" as const,
    observation: true,
    help: "Enter a recorded value in your chosen unit; this is a personal record, not an interpretation.",
  })),
];
const canonicalKeys: Record<string, string> = {
  Birthday: "birth_date",
  "Full name": "legal_name",
  "Preferred name": "preferred_name",
  Chest: "chest",
  "Shoulder width": "shoulders_bone_to_bone",
  "Thigh circumference": "upper_thigh",
  "Calf circumference": "calf",
  "Neck circumference": "neck",
  "Wrist circumference": "wrist",
  "Heart rate variability": "heart_rate_variability",
  "VO2 max": "vo2_max",
};
export const fieldPresets: FieldPreset[] = definitions.map((field) => ({
  ...field,
  ...((
    {
      Hair: { color: "", length: "", texture: "" },
      Eyes: { color: "" },
      Skin: { tone: "", undertone: "" },
    } as Record<string, Record<string, string>>
  )[field.name]
    ? {
        type: "json" as const,
        shape: (
          {
            Hair: { color: "", length: "", texture: "" },
            Eyes: { color: "" },
            Skin: { tone: "", undertone: "" },
          } as Record<string, Record<string, string>>
        )[field.name],
      }
    : {}),
  attribute:
    canonicalKeys[field.name] ||
    field.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
}));
export function attributeLabel(attribute: string) {
  return (
    fieldPresets.find((field) => field.attribute === attribute)?.name ||
    attribute.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())
  );
}
export const findPreset = (category: string, name: string) =>
  fieldPresets.find(
    (field) =>
      field.category === category &&
      (field.name.toLowerCase() === name.toLowerCase() ||
        field.attribute === name),
  );
