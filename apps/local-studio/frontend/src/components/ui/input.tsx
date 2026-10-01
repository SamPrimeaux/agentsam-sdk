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

/**
 * Masked secret field that password managers (iCloud Passwords, Chrome, 1Password,
 * LastPass, Bitwarden) will not offer to save. A type="password" field next to a name
 * field gets treated as a login form, so API keys ended up in the user's saved
 * passwords. Masking is done with CSS on a text input instead.
 */
function SecretInput({
  revealed = false,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { revealed?: boolean }) {
  return (
    <Input
      {...props}
      type="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore
      data-lpignore="true"
      data-bwignore
      data-form-type="other"
      className={cn(!revealed && "[-webkit-text-security:disc]", className)}
    />
  );
}


export { Input, Textarea, SecretInput };
