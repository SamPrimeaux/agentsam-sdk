import { ResizableStageHandle } from "@inneranimalmedia/agentsam-workbench/shell";
import { cn } from "@/lib/utils";

export function SplitHandle({
  axis = "x",
  onDrag,
  onDoubleClick,
  label,
  className,
}: {
  axis?: "x" | "y";
  onDrag: (deltaPx: number) => void;
  onDoubleClick?: () => void;
  label: string;
  className?: string;
}) {
  return (
    <ResizableStageHandle
      axis={axis}
      onDrag={onDrag}
      onDoubleClick={onDoubleClick}
      label={label}
      className={cn("studio-separator", axis === "y" && "is-row", className)}
      bodyResizeAttribute="data-resizing"
      bodyHoverAttribute="data-split-hover"
    />
  );
}
