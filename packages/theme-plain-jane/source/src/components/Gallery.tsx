import { motion } from "motion/react";
import { useState } from "react";
import { Lightbox } from "./Lightbox";
import { FadeImage } from "./FadeImage";

interface GalleryProps {
  images: { src: string; alt: string; caption?: string }[];
}

export function Gallery({ images }: GalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  return (
    <>
      <figure className="my-16 w-full max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {images.map((img, idx) => (
            <motion.button 
              key={idx}
              onClick={() => setSelectedIndex(idx)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
              className={`overflow-hidden rounded-sm bg-ink/5 cursor-zoom-in group ${idx === 0 ? 'sm:col-span-2 sm:row-span-2' : ''}`}
            >
              <FadeImage 
                src={img.src} 
                alt={img.alt} 
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover group-hover:scale-105"
                style={{ minHeight: idx === 0 ? '100%' : '300px' }}
              />
            </motion.button>
          ))}
        </div>
        {images.some(img => img.caption) && (
          <figcaption className="mt-4 text-center text-sm italic text-ink-light">
            {images.find(img => img.caption)?.caption}
          </figcaption>
        )}
      </figure>

      <Lightbox 
        isOpen={selectedIndex !== null}
        onClose={() => setSelectedIndex(null)}
        src={selectedIndex !== null ? images[selectedIndex].src : ""}
        alt={selectedIndex !== null ? images[selectedIndex].alt : ""}
        caption={selectedIndex !== null ? images[selectedIndex].caption : ""}
      />
    </>
  );
}
