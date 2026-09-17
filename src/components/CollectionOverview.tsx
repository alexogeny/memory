import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Clock3,
  Heart,
  Leaf,
  MapPin,
  Ruler,
  StickyNote,
  UserRound,
  Users,
} from "lucide-react";
import { categories, overviewCollection, type MemoryRecord } from "../model";
import { attributeLabel } from "../fields";
import { Button } from "./ui/button";
export const categoryIcons: Record<string, typeof Leaf> = {
  profile: UserRound,
  appearance: Ruler,
  measurements: Ruler,
  health: Heart,
  people: Users,
  family: Users,
  relationships: Heart,
  places: MapPin,
  notes: StickyNote,
};
export function CollectionOverview({
  records,
  onCategory,
  onEdit,
  hasMore,
}: {
  records: MemoryRecord[];
  onCategory: (category: string) => void;
  onEdit: (record: MemoryRecord) => void;
  hasMore: boolean;
}) {
  const overview = overviewCollection(records);
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="collection-overview space-y-7">
      <div className="overview-glance relative overflow-hidden rounded-3xl border border-[#e7dcec] bg-gradient-to-br from-[#efe5f4] via-[#f5edf4] to-[#f5e8e9] p-5">
        <div className="relative z-10">
          <span className="text-[11px] font-medium text-[#705b77]">
            Your collection
          </span>
          <div className="mt-3 flex items-end gap-2">
            <strong className="text-[36px] font-semibold leading-none tracking-[-2px] text-[#584563]">
              {records.length}
              {hasMore ? "+" : ""}
            </strong>
            <span className="pb-1 text-xs text-[#705b77]">saved details</span>
          </div>
          <p className="mt-3 text-[11px] text-[#705b77]">
            Across {overview.categories.length} categories
          </p>
        </div>
        <div className="absolute -right-4 -top-3 flex size-36 rotate-[-15deg] items-center justify-center rounded-full border-[18px] border-white/25 text-[#b59cc2]/45">
          <Leaf size={66} strokeWidth={1} />
        </div>
        <span className="absolute bottom-5 right-6 size-2 rounded-full bg-[#d7b8c9]" />
      </div>
      <section aria-label="Explore your collection">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Browse by category
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-1 text-[11px]"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Less" : "View all"}
            <ChevronRight size={14} />
          </Button>
        </div>
        <div className="category-tiles grid grid-cols-2 gap-3 md:grid-cols-3">
          {overview.categories
            .slice(0, expanded ? undefined : 6)
            .map((group) => {
              const Icon = categoryIcons[group.id] || Leaf;
              return (
                <button
                  key={group.id}
                  className={`category-tile group relative min-h-[123px] rounded-[20px] border border-border bg-card p-4 text-left transition-all active:scale-[.98] hover:border-primary/40 category-${group.id}`}
                  onClick={() => onCategory(group.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="category-icon flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon size={18} />
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {group.count}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[13px] font-semibold">
                    {categories.find((category) => category.id === group.id)
                      ?.name || attributeLabel(group.id)}
                  </h3>
                  <p className="mt-1 truncate pr-2 text-[10px] text-muted-foreground">
                    {group.preview.map(attributeLabel).join(" · ")}
                  </p>
                </button>
              );
            })}
        </div>
        {overview.categories.length > 6 && !expanded && (
          <button
            className="show-categories mx-auto mt-3 flex min-h-10 items-center gap-1 text-[11px] font-medium text-primary"
            onClick={() => setExpanded(true)}
          >
            Show all {overview.categories.length} categories
            <ChevronDown size={13} />
          </button>
        )}
      </section>
      <section aria-label="Recently updated">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Recently updated
          </h2>
          <Clock3 size={16} className="text-muted-foreground" />
        </div>
        <div className="recent-list overflow-hidden rounded-[20px] border border-border bg-card">
          {overview.recent.map((record) => {
            const Icon = categoryIcons[record.category] || Leaf;
            return (
              <button
                key={record.id}
                className="recent-memory flex min-h-[76px] w-full items-center gap-3 border-b border-border p-4 text-left transition-colors last:border-0 hover:bg-muted active:bg-muted"
                onClick={() => onEdit(record)}
                aria-label={`Edit ${attributeLabel(record.attribute)}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs font-semibold">
                    {attributeLabel(record.attribute)}
                  </strong>
                  <small className="mt-1 block truncate text-[10px] text-muted-foreground">
                    {typeof record.value === "object"
                      ? categories.find((c) => c.id === record.category)
                          ?.name || "View details"
                      : String(record.value)}
                    {record.unit ? ` ${record.unit}` : ""}
                  </small>
                </span>
                <ChevronRight size={15} className="text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
