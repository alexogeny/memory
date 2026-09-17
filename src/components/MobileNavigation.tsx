import { House, Compass, Users, Settings2, Plus } from "lucide-react";
import { TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
export type AppTab = "home" | "explore" | "people" | "settings";
export function MobileNavigation({
  onAdd,
  showAdd,
}: {
  onAdd: () => void;
  showAdd: boolean;
}) {
  return (
    <>
      {showAdd && (
        <Button
          className="mobile-add fixed bottom-[calc(94px+env(safe-area-inset-bottom))] right-5 z-30 h-14 gap-2 rounded-full px-5 shadow-[0_7px_24px_#76568c42] md:hidden"
          aria-label="New memory"
          onClick={onAdd}
        >
          <Plus size={21} />
          <span className="text-xs font-semibold">New memory</span>
        </Button>
      )}
      <TabsList
        aria-label="Main navigation"
        className="mobile-tabbar fixed inset-x-0 bottom-0 z-30 grid h-[calc(76px+env(safe-area-inset-bottom))] grid-cols-4 items-start gap-0 rounded-none border-t border-border/70 bg-card/95 px-3 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-6px_25px_#45315104] backdrop-blur-xl md:hidden"
      >
        {[
          { id: "home", label: "Home", Icon: House },
          { id: "explore", label: "Explore", Icon: Compass },
          { id: "people", label: "People", Icon: Users },
          { id: "settings", label: "Settings", Icon: Settings2 },
        ].map(({ id, label, Icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            className="group flex h-[58px] flex-col gap-1 rounded-2xl px-2 text-[10px] data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors group-data-[state=active]:bg-primary/10">
              <Icon size={20} />
            </span>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </>
  );
}
