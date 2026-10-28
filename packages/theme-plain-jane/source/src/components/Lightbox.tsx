import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useEffect } from "react";
import { FadeImage } from "./FadeImage";

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  caption?: string;
}

export function Lightbox({ isOpen, onClose, src, alt, caption }: LightboxProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/95 backdrop-blur-md p-4 sm:p-8"
          onClick={onClose}
        >
          <button 
            className="absolute top-6 right-6 p-2 text-paper/50 hover:text-paper transition-colors z-10"
            onClick={onClose}
            aria-label="Close lightbox"
          >
            <X className="h-8 w-8" />
          </button>
          
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative max-h-full max-w-6xl w-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <FadeImage 
              src={src} 
              alt={alt} 
              referrerPolicy="no-referrer"
              className="max-h-[75vh] w-auto object-contain rounded-sm shadow-2xl shadow-black/60"
            />
            {caption && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="mt-8 text-center"
              >
                <p className="text-paper/90 font-serif text-xl md:text-2xl max-w-2xl italic leading-relaxed drop-shadow-md">
                  {caption}
                </p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
