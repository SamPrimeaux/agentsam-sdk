import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      suppressHydrationWarning
      className={cn(
        "flex h-10 w-full rounded-lg bg-muted px-3 text-sm text-foreground shadow-hairline placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--color-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      suppressHydrationWarning
      className={cn(
        "flex min-h-20 w-full resize-none rounded-lg bg-transparent px-1 py-1 text-sm text-foreground placeholder:text-muted-foreground",
        "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export { Input, Textarea };
