import { useState, useEffect, useRef } from "react";
import { cn } from "../lib/utils";

export function FadeImage({ className, src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setIsLoaded(true);
    }
  }, [src]);

  return (
    <img
      ref={imgRef}
      src={src}
      className={cn(
        "transition-all duration-700 ease-out",
        isLoaded ? "opacity-100 blur-0" : "opacity-0 blur-md",
        className
      )}
      onLoad={() => setIsLoaded(true)}
      {...props}
    />
  );
}
