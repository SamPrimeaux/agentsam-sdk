import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ImageLightbox({
  src,
  alt,
  children,
  triggerClassName,
}: {
  src: string;
  alt: string;
  children: ReactNode;
  triggerClassName?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={triggerClassName} aria-label={`Expand image: ${alt}`}>
          {children}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(96vw,1200px)] border-border bg-background p-2 sm:p-3">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <img src={src} alt={alt} className="max-h-[84vh] w-full rounded-lg object-contain" />
      </DialogContent>
    </Dialog>
  );
}
