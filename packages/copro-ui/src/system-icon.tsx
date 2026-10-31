import React from "react";

export type CoProSystemIconMap = Readonly<Record<string, string | undefined>>;

export type CoProSystemIconProps = {
  name: string;
  icons?: CoProSystemIconMap;
  size?: number;
  className?: string;
  title?: string;
  fallback?: React.ReactNode;
};

/**
 * Renders canonical AgentSam system SVGs supplied by the host application.
 * The markup comes from checked-in, first-party agentsam-brand assets—not user content.
 */
export function CoProSystemIcon({
  name,
  icons,
  size = 18,
  className,
  title,
  fallback = null,
}: CoProSystemIconProps) {
  const source = icons?.[name];
  if (!source) return <>{fallback}</>;

  const markup = source
    .replace(/^\s*<\?xml[^>]*\?>\s*/i, "")
    .replace(/\s+id="icon-[^"]+"/, "");

  return (
    <span
      className={["copro-system-icon", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
