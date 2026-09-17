import { ChevronRight, Plus, UserRound, MapPin, Leaf } from "lucide-react";
import { categories, type MemoryRecord, type Subject } from "../model";
import { categoryIcons } from "./CollectionOverview";
import { Button } from "./ui/button";
export function ExploreView({
  records,
  onCategory,
}: {
  records: MemoryRecord[];
  onCategory: (category: string) => void;
}) {
  const counts = new Map<string, number>();
  for (const record of records)
    counts.set(record.category, (counts.get(record.category) || 0) + 1);
  return (
    <div className="grid gap-3 pb-4 sm:grid-cols-2">
      <p className="mb-1 text-sm text-muted-foreground sm:col-span-2">
        Everything has a place.
      </p>
      {categories.map((category) => {
        const Icon = categoryIcons[category.id] || Leaf;
        return (
          <button
            key={category.id}
            onClick={() => onCategory(category.id)}
            className="flex min-h-19 items-center gap-3 rounded-[20px] border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted active:bg-muted"
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/8 text-primary">
              <Icon size={20} />
            </span>
            <span className="flex-1">
              <strong className="block text-[13px] font-semibold">
                {category.name}
              </strong>
              <small className="mt-1 block text-[11px] text-muted-foreground">
                {counts.get(category.id) || 0} details
              </small>
            </span>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}
export function PeopleView({
  subjects,
  onSelect,
  onAdd,
}: {
  subjects: Subject[];
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          The people and places in your life.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {subjects.map((subject) => {
          const Icon = subject.kind === "place" ? MapPin : UserRound;
          return (
            <button
              key={subject.id}
              onClick={() => onSelect(subject.id)}
              className="flex min-h-24 items-center gap-4 rounded-[22px] border border-border bg-card p-4 text-left transition-colors hover:bg-muted active:bg-muted"
            >
              <span className="flex size-13 items-center justify-center rounded-2xl bg-[#eadfea] text-[#987c9e]">
                <Icon size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold">
                  {subject.name}
                </strong>
                <small className="mt-1 block text-xs capitalize text-muted-foreground">
                  {subject.id === "self" ? "Your memories" : subject.kind}
                </small>
              </span>
              <ChevronRight size={17} className="text-muted-foreground" />
            </button>
          );
        })}
      </div>
      <Button
        variant="secondary"
        className="w-full justify-start rounded-[20px] border-dashed"
        onClick={onAdd}
      >
        <Plus />
        Add a person or place
      </Button>
    </div>
  );
}
