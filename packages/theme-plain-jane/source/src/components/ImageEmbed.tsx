import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { Lightbox } from "./Lightbox";
import { FadeImage } from "./FadeImage";

interface ImageEmbedProps {
  src: string;
  alt: string;
  caption?: string;
  size?: "default" | "wide" | "full";
}

export function ImageEmbed({ src, alt, caption, size = "default" }: ImageEmbedProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  return (
    <>
      <motion.figure 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "my-16 mx-auto",
          size === "default" && "max-w-4xl px-4 sm:px-6 lg:px-8",
          size === "wide" && "max-w-6xl px-4 sm:px-6 lg:px-8",
          size === "full" && "w-full max-w-none"
        )}
      >
        <button 
          onClick={() => setIsLightboxOpen(true)}
          className="w-full overflow-hidden rounded-sm bg-ink/5 cursor-zoom-in group"
        >
          <FadeImage 
            src={src} 
            alt={alt} 
            referrerPolicy="no-referrer"
            className="w-full h-auto object-cover group-hover:scale-[1.02]"
            loading="lazy"
          />
        </button>
        {caption && (
          <figcaption className="mt-4 text-center text-sm italic text-ink-light max-w-2xl mx-auto px-4">
            {caption}
          </figcaption>
        )}
      </motion.figure>

      <Lightbox 
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        src={src}
        alt={alt}
        caption={caption}
      />
    </>
  );
}
