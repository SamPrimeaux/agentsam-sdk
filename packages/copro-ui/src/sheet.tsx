import React, { useEffect, useRef } from "react";

export type CoProSheetDetent = "peek" | "compact" | "half" | "expanded" | "fullscreen";

export type CoProSheetProps = {
  open: boolean;
  title: string;
  detent?: CoProSheetDetent;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
};

export function CoProSheet({
  open,
  title,
  detent = "half",
  children,
  onClose,
  footer,
}: CoProSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="copro-sheet-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        ref={dialogRef}
        className={"copro-sheet copro-sheet-" + detent}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button className="copro-sheet-grabber" aria-label="Close sheet" onClick={onClose}>
          <span />
        </button>
        <div className="copro-sheet-header">
          <h2>{title}</h2>
          <button className="copro-icon-button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="copro-sheet-body">{children}</div>
        {footer ? <div className="copro-sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
