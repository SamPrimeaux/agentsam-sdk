import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type IconActionProps = Omit<ButtonProps, "aria-label" | "title" | "asChild"> & {
  /** Action name for assistive technology; never substitute an icon or tooltip. */
  label: string;
  /** Optional plain-language help, also available when the control receives focus. */
  hint?: string;
  children: ReactNode;
};

/**
 * Accessible action contract: a persistent name, discoverable helper and
 * mobile-friendly hit area. Radix tooltip is additive, never the sole label.
 */
export function IconAction({
  label,
  hint,
  children,
  className,
  size = "icon-sm",
  ...props
}: IconActionProps) {
  if (!label.trim()) throw new Error("IconAction requires a meaningful accessible label");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          type={props.type ?? "button"}
          size={size}
          aria-label={label}
          className={cn("min-h-11 min-w-11 md:min-h-8 md:min-w-8", className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint || label}</TooltipContent>
    </Tooltip>
  );
}
