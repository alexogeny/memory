import * as Primitive from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils";
import type { ComponentProps } from "react";
export const Tabs = Primitive.Root;
export function TabsList({
  className,
  ...props
}: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl bg-muted p-1",
        className,
      )}
      {...props}
    />
  );
}
export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs font-medium text-muted-foreground outline-none transition-all focus-visible:ring-4 focus-visible:ring-ring/30 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content className={cn("outline-none", className)} {...props} />
  );
}
