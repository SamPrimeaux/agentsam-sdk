import { motion, AnimatePresence } from "motion/react";
import { Search, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { articles } from "../data/articles";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setQuery("");
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const results = query.length > 1 
    ? articles.filter(a => 
        a.title.toLowerCase().includes(query.toLowerCase()) || 
        a.excerpt.toLowerCase().includes(query.toLowerCase()) ||
        a.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
      )
    : [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] bg-paper/95 backdrop-blur-md flex flex-col"
        >
          <div className="flex justify-end p-6">
            <button onClick={onClose} className="p-2 text-ink-light hover:text-ink transition-colors">
              <X className="h-8 w-8" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-24">
            <div className="mx-auto max-w-3xl pt-12">
              <div className="relative">
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-8 text-ink-light" />
                <input 
                  type="text" 
                  placeholder="Search articles, topics..." 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  className="w-full bg-transparent border-b-2 border-ink/20 py-4 pl-12 pr-4 text-3xl font-serif text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none transition-colors"
                />
              </div>
              
              <div className="mt-16 flex flex-col gap-8">
                {query.length > 1 && results.length === 0 && (
                  <p className="text-ink-light text-lg">No results found for "{query}".</p>
                )}
                {results.map((article, idx) => (
                  <motion.div 
                    key={article.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Link to={`/post/${article.slug}`} onClick={onClose} className="group block">
                      <span className="text-xs font-medium uppercase tracking-wider text-accent mb-2 block">{article.tags[0]}</span>
                      <h3 className="font-serif text-2xl text-ink group-hover:text-accent transition-colors mb-2">{article.title}</h3>
                      <p className="text-ink-light line-clamp-2">{article.excerpt}</p>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
