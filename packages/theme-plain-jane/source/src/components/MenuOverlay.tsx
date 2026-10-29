import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect } from "react";

interface MenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MenuOverlay({ isOpen, onClose }: MenuOverlayProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const links = [
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
    { name: "Essays", path: "/" },
    { name: "Photography", path: "/photography" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-ink/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 z-[100] w-full max-w-sm bg-paper shadow-2xl flex flex-col"
          >
            <div className="flex justify-between items-center p-6 border-b border-ink/5">
              <span className="font-serif text-lg font-semibold tracking-wide">MENU</span>
              <button onClick={onClose} className="p-2 text-ink-light hover:text-ink transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <nav className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 justify-center">
              {links.map((link, idx) => (
                <motion.div
                  key={link.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + idx * 0.1 }}
                >
                  <Link 
                    to={link.path} 
                    onClick={onClose}
                    className="font-serif text-4xl text-ink hover:text-accent transition-colors"
                  >
                    {link.name}
                  </Link>
                </motion.div>
              ))}
            </nav>
            
            <div className="p-8 border-t border-ink/5">
              <div className="flex gap-4 text-sm font-medium uppercase tracking-wider text-ink-light">
                <a href="#" className="hover:text-accent transition-colors">Twitter</a>
                <a href="#" className="hover:text-accent transition-colors">Instagram</a>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
