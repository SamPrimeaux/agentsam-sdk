import { ResizableStageHandle } from "@inneranimalmedia/agentsam-workbench/shell";
import { cn } from "@/lib/utils";

export function SplitHandle({
  axis = "x",
  onDrag,
  onDragEnd,
  onDoubleClick,
  label,
  title,
  className,
}: {
  axis?: "x" | "y";
  onDrag: (deltaPx: number) => void;
  onDragEnd?: () => void;
  onDoubleClick?: () => void;
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <ResizableStageHandle
      axis={axis}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onDoubleClick={onDoubleClick}
      label={label}
      title={title}
      className={cn("studio-separator", axis === "y" && "is-row", className)}
      bodyResizeAttribute="data-resizing"
      bodyHoverAttribute="data-split-hover"
    />
  );
}
