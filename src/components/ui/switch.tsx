import * as Primitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
export function Switch({
  className,
  ...props
}: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn(
        "inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-border outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring/30 data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <Primitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5 motion-reduce:transition-none" />
    </Primitive.Root>
  );
}
