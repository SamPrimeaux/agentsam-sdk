import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Search, Menu } from "lucide-react";
import { useState } from "react";
import { MenuOverlay } from "./MenuOverlay";
import { SearchOverlay } from "./SearchOverlay";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <>
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="sticky top-0 z-50 w-full border-b border-ink/5 bg-paper/80 backdrop-blur-md"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="p-2 text-ink-light hover:text-ink transition-colors"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Menu</span>
            </button>
          </div>
          
          <Link 
            to="/" 
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <span className="font-serif text-xl font-semibold tracking-wide">JANE DOE</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="p-2 text-ink-light hover:text-ink transition-colors"
            >
              <Search className="h-5 w-5" />
              <span className="sr-only">Search</span>
            </button>
            <Link 
              to="/about" 
              className="hidden text-sm font-medium uppercase tracking-wider text-ink-light hover:text-ink sm:block transition-colors"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              About
            </Link>
          </div>
        </div>
      </motion.header>

      <MenuOverlay isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
