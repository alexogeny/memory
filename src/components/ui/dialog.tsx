import * as Primitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
export function Dialog({
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
  return (
    <Primitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Primitive.Portal>
        <Primitive.Overlay className="sheet-overlay fixed inset-0 z-50 bg-[#21182e]/35 backdrop-blur-sm data-[state=open]:animate-overlay-in motion-reduce:animate-none" />
        <Primitive.Content
          aria-describedby={undefined}
          className={cn(
            "sheet-content fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col overflow-hidden rounded-t-[30px] border border-border bg-card text-foreground shadow-2xl outline-none data-[state=open]:animate-sheet-in motion-reduce:animate-none md:inset-auto md:left-1/2 md:top-1/2 md:w-[520px] md:max-h-[88dvh] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl",
            wide && "md:w-[640px]",
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border md:hidden" />
          <header className="flex shrink-0 items-center justify-between gap-4 px-6 pb-4 pt-5">
            <Primitive.Title className="text-xl font-semibold tracking-tight">
              {title}
            </Primitive.Title>
            <Primitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X />
              </Button>
            </Primitive.Close>
          </header>
          <div className="sheet-scroll overflow-y-auto overscroll-contain px-6 pb-6">
            {children}
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
