import { Link } from "react-router-dom";
import { motion } from "motion/react";
import type { Article } from "../data/articles";
import { cn } from "../lib/utils";
import { FadeImage } from "./FadeImage";

interface ArticleCardProps {
  article: Article;
  featured?: boolean;
  index: number;
}

export function ArticleCard({ article, featured = false, index }: ArticleCardProps) {
  return (
    <motion.article 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group flex flex-col gap-6",
        featured ? "md:flex-row md:items-center md:gap-12" : ""
      )}
    >
      <Link 
        to={`/post/${article.slug}`} 
        className={cn(
          "block overflow-hidden rounded-sm bg-ink/5",
          featured ? "aspect-[16/9] md:aspect-[4/3] md:w-3/5" : "aspect-[4/3] w-full"
        )}
      >
        <FadeImage 
          src={article.coverImage} 
          alt={article.title} 
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover group-hover:scale-105"
          loading="lazy"
        />
      </Link>
      
      <div className={cn(
        "flex flex-col",
        featured ? "md:w-2/5" : ""
      )}>
        <div className="mb-3 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-ink-light">
          <span>{article.date}</span>
          <span className="h-1 w-1 rounded-full bg-ink/20"></span>
          <span>{article.tags[0]}</span>
        </div>
        
        <Link to={`/post/${article.slug}`} className="group-hover:text-accent transition-colors">
          <h2 className={cn(
            "font-serif leading-tight text-ink",
            featured ? "text-3xl md:text-5xl mb-4" : "text-2xl mb-3"
          )}>
            {article.title}
          </h2>
        </Link>
        
        <p className={cn(
          "text-ink-light leading-relaxed",
          featured ? "text-lg mb-6" : "text-sm mb-4 line-clamp-3"
        )}>
          {article.excerpt}
        </p>
        
        <div className="mt-auto flex items-center gap-3">
          <FadeImage 
            src={article.author.avatar} 
            alt={article.author.name}
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-full object-cover grayscale"
          />
          <div className="flex flex-col">
            <span className="text-xs font-medium">{article.author.name}</span>
            <span className="text-xs text-ink-light">{article.readTime}</span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
