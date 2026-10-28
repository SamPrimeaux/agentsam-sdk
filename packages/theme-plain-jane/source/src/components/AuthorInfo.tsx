import type { Author } from "../data/articles";

interface AuthorInfoProps {
  author: Author;
}

export function AuthorInfo({ author }: AuthorInfoProps) {
  return (
    <div className="mt-24 border-t border-ink/10 pt-12">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
        <img 
          src={author.avatar} 
          alt={author.name} 
          referrerPolicy="no-referrer"
          className="h-24 w-24 rounded-full object-cover grayscale"
        />
        <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
          <h3 className="font-serif text-2xl font-medium tracking-tight text-ink">
            Written by {author.name}
          </h3>
          <p className="mt-3 max-w-md text-ink-light leading-relaxed">
            {author.bio}
          </p>
          <div className="mt-4 flex gap-4 text-sm font-medium uppercase tracking-wider text-ink-light">
            {author.twitter && <a href="#" className="hover:text-accent transition-colors">Twitter</a>}
            {author.instagram && <a href="#" className="hover:text-accent transition-colors">Instagram</a>}
          </div>
        </div>
      </div>
    </div>
  );
}
