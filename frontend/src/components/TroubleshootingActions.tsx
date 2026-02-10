import * as React from "react";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

type TroubleshootingActionsProps = {
  children: React.ReactNode;
  defaultOpen?: boolean;
  hint?: string;
  className?: string;
};

export function TroubleshootingActions({
  children,
  defaultOpen = false,
  hint,
  className,
}: TroubleshootingActionsProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const contentId = React.useId();

  return (
    <div className={cn("flex flex-col items-end gap-2", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <Wrench className="mr-2 h-4 w-4" />
        Troubleshooting
        {open ? (
          <ChevronUp className="ml-2 h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
        )}
      </Button>

      {open ? (
        <div
          id={contentId}
          role="region"
          aria-label="Troubleshooting actions"
          className="w-full max-w-xs rounded-md border bg-muted/20 p-2"
        >
          {hint ? <div className="px-1 pb-2 text-xs text-muted-foreground">{hint}</div> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
