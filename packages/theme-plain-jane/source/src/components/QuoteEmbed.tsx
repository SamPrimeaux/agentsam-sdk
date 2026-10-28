import { motion } from "motion/react";

interface QuoteEmbedProps {
  quote: string;
  author?: string;
  source?: string;
}

export function QuoteEmbed({ quote, author, source }: QuoteEmbedProps) {
  return (
    <motion.blockquote 
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="my-16 mx-auto max-w-3xl border-l-2 border-accent pl-6 sm:pl-8 pr-4 sm:pr-0 py-4"
    >
      <p className="font-serif text-2xl italic leading-relaxed text-ink md:text-3xl">
        &ldquo;{quote}&rdquo;
      </p>
      {(author || source) && (
        <footer className="mt-6 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-ink-light">
          {author && <span>{author}</span>}
          {author && source && <span className="h-1 w-1 rounded-full bg-ink/20"></span>}
          {source && <cite className="normal-case italic">{source}</cite>}
        </footer>
      )}
    </motion.blockquote>
  );
}
