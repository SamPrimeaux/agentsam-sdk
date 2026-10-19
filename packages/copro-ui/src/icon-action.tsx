import React from "react";

/**
 * Accessible icon control with keyboard-visible contextual help.
 * Shares the actual button's CSS/layout so dock/trim hit targets do not move.
 */
export function IconAction({
  children, className = "", title, type = "button", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const accessibleName = props["aria-label"] || title;
  if (!accessibleName) throw new Error("copro_icon_action_name_required");
  const help = typeof title === "string" ? title : String(accessibleName);
  return <button
    {...props}
    type={type}
    title={help}
    aria-label={accessibleName}
    className={["copro-icon-action", className].filter(Boolean).join(" ")}
    data-tooltip={help}
  >{children}</button>;
}
