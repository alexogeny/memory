import * as Primitive from "@radix-ui/react-alert-dialog";
import type { ReactNode } from "react";
import { Button } from "./button";
export function ConfirmDialog({
  title,
  description,
  children,
  onClose,
  onConfirm,
  busy,
  confirmLabel,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  confirmLabel: string;
}) {
  return (
    <Primitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-[#21182e]/35 backdrop-blur-sm" />
        <Primitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-40px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl outline-none">
          <Primitive.Title className="text-xl font-semibold tracking-tight">
            {title}
          </Primitive.Title>
          <Primitive.Description className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {description}
          </Primitive.Description>
          {children}
          <div className="mt-6 flex justify-end gap-2">
            <Primitive.Cancel asChild>
              <Button variant="secondary">Keep memory</Button>
            </Primitive.Cancel>
            <Button variant="destructive" disabled={busy} onClick={onConfirm}>
              {busy ? "Retracting…" : confirmLabel}
            </Button>
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
