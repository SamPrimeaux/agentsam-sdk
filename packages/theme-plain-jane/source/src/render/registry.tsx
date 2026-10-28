/**
 * Component Registry for Plain Jane Journal CMS
 * Maps definition_key -> ComponentType
 * Every rendered section root renders data-section-id, data-definition-key, data-template-sku
 * Every rendered block root renders data-block-id, data-block-key, data-definition-key, data-template-sku
 * Unknown keys render a visible "unregistered: <key>" placeholder and NEVER throw.
 */

import React from "react";
import type { CMSBlock, CMSPage, CMSSection } from "../data/cms";
import { resolveAsset } from "../data/cms";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "motion/react";
import { FadeImage } from "../components/FadeImage";
import { Lightbox } from "../components/Lightbox";
import { AppLogo } from "../components/AppLogo";
import { Menu, Search } from "lucide-react";
import { MenuOverlay } from "../components/MenuOverlay";
import { SearchOverlay } from "../components/SearchOverlay";

// Props passed to Sections
export interface CMSSectionProps<TSettings = Record<string, unknown>> {
  section: CMSSection<TSettings>;
  page: CMSPage;
}

// Props passed to Blocks
export interface CMSBlockProps<TContent = Record<string, unknown>> {
  block: CMSBlock<TContent>;
  section: CMSSection;
  page: CMSPage;
}

export type CMSComponentType = React.ComponentType<any>;

// ----------------------------------------------------
// Section Implementations
// ----------------------------------------------------

/**
 * Header Navigation Section (journal-header)
 */
export function JournalHeaderSection({ section }: CMSSectionProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        data-section-id={section.id}
        data-definition-key={section.definition_key}
        data-template-sku={section.template_sku || "tpl-journal-header-default"}
        className="sticky top-0 z-50 w-full border-b border-[var(--border-subtle)] bg-[var(--bg)]/80 backdrop-blur-md"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMenuOpen(true)}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <AppLogo size={26} />
          </div>

          <Link
            to="/"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <span className="font-serif text-xl font-semibold tracking-wide text-[var(--text)]">
              JANE DOE
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              aria-label="Open search"
            >
              <Search className="h-5 w-5" />
            </button>
            <Link
              to="/about"
              className="hidden text-sm font-medium uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text)] sm:block transition-colors"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
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

/**
 * Footer Section (journal-footer)
 */
export function JournalFooterSection({ section }: CMSSectionProps) {
  return (
    <footer
      data-section-id={section.id}
      data-definition-key={section.definition_key}
      data-template-sku={section.template_sku || "tpl-journal-footer-default"}
      className="border-t border-[var(--border-divider)] bg-[var(--bg)] py-12 mt-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <AppLogo size={24} />
              <span className="font-serif text-xl font-semibold tracking-wide text-[var(--text)]">JANE DOE</span>
            </div>
            <p className="text-sm text-[var(--text-muted)] max-w-xs">
              Documenting the quiet moments between the noise. A journal of travel, photography, and finding meaning in the everyday.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Explore</h4>
            <nav className="flex flex-col gap-2">
              <Link to="/" className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors">Essays</Link>
              <Link to="/photography" className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors">Photography</Link>
              <Link to="/" className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors">Travel</Link>
              <Link to="/about" className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors">About</Link>
            </nav>
          </div>

          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Connect</h4>
            <nav className="flex flex-col gap-2">
              <a href="#" className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors">Twitter</a>
              <a href="#" className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors">Instagram</a>
              <a href="#" className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors">Substack</a>
              <a href="#" className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors">Email</a>
            </nav>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-8 sm:flex-row text-center sm:text-left">
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Jane Doe. All rights reserved.
          </p>
          <div className="flex gap-4 text-xs text-[var(--text-muted)]">
            <Link to="/privacy" className="hover:text-[var(--accent)] transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-[var(--accent)] transition-colors">Terms</Link>
            <Link to="/contact" className="hover:text-[var(--accent)] transition-colors">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * Home Hero Section (journal-home-hero)
 */
export function JournalHomeHeroSection({ section, page }: CMSSectionProps<{
  title_prefix?: string;
  title_highlight?: string;
  title_suffix?: string;
  subtitle?: string;
}>) {
  const data = section.section_data || {};
  const prefix = data.title_prefix ?? "Notes on a ";
  const highlight = data.title_highlight ?? "quieter";
  const suffix = data.title_suffix ?? " life.";
  const subtitle = data.subtitle ?? "Essays, photography, and reflections on finding meaning in the spaces between the noise.";

  return (
    <section
      data-section-id={section.id}
      data-definition-key={section.definition_key}
      data-template-sku={section.template_sku || "tpl-journal-home-hero-default"}
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="mb-16 max-w-3xl"
      >
        <h1 className="font-serif text-5xl font-medium leading-tight tracking-tight text-[var(--text)] sm:text-6xl md:text-7xl">
          {prefix}
          <span className="italic text-[var(--accent)]">{highlight}</span>
          {suffix}
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[var(--text-muted)] sm:text-xl">
          {subtitle}
        </p>
      </motion.div>

      <div className="w-full">
        {section.blocks.map((block) => (
          <RenderBlock key={block.id} block={block} section={section} page={page} />
        ))}
      </div>
    </section>
  );
}

/**
 * Latest Entries Section (journal-latest-entries)
 */
export function JournalLatestEntriesSection({ section, page }: CMSSectionProps<{
  section_title?: string;
  view_all_label?: string;
  view_all_path?: string;
}>) {
  const data = section.section_data || {};
  const title = data.section_title ?? "Latest Entries";
  const viewAll = data.view_all_label ?? "View All";
  const viewAllPath = data.view_all_path ?? "#";

  return (
    <section
      data-section-id={section.id}
      data-definition-key={section.definition_key}
      data-template-sku={section.template_sku || "tpl-journal-latest-entries-default"}
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
    >
      <div className="mb-12 flex items-center justify-between border-b border-[var(--border-divider)] pb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text)]">
          {title}
        </h2>
        <a
          href={viewAllPath}
          className="text-sm font-medium uppercase tracking-wider text-[var(--accent)] hover:text-[var(--text)] transition-colors"
        >
          {viewAll}
        </a>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-2">
        {section.blocks.map((block) => (
          <RenderBlock key={block.id} block={block} section={section} page={page} />
        ))}
      </div>
    </section>
  );
}

/**
 * Post Hero Section (journal-post-hero)
 */
export function JournalPostHeroSection({ section, page }: CMSSectionProps) {
  const meta = (page.metadata || {}) as {
    date?: string;
    category?: string;
    read_time?: string;
    cover_asset_id?: string;
  };

  const coverAsset = resolveAsset(meta.cover_asset_id);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 1000], [0, 300]);
  const opacity = useTransform(scrollY, [0, 500], [1, 0]);

  return (
    <div
      data-section-id={section.id}
      data-definition-key={section.definition_key}
      data-template-sku={section.template_sku || "tpl-journal-post-hero-default"}
      className="relative h-[70vh] min-h-[500px] w-full overflow-hidden bg-[var(--text)]"
    >
      <motion.div style={{ y, opacity }} className="absolute inset-0">
        <FadeImage
          src={coverAsset.url}
          alt={coverAsset.alt_text || page.title}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover opacity-60"
        />
      </motion.div>

      <div className="absolute inset-0 bg-gradient-to-t from-[var(--hero-gradient)] via-transparent to-transparent" />

      <div className="absolute bottom-0 left-0 w-full p-6 sm:p-12 md:p-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-4xl"
        >
          <div className="mb-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-[var(--bg)]/80">
            {meta.date && <span>{meta.date}</span>}
            {meta.date && meta.category && <span className="h-1 w-1 rounded-full bg-[var(--bg)]/40" />}
            {meta.category && <span>{meta.category}</span>}
            {meta.category && meta.read_time && <span className="h-1 w-1 rounded-full bg-[var(--bg)]/40" />}
            {meta.read_time && <span>{meta.read_time}</span>}
          </div>

          <h1 className="font-serif text-4xl font-medium leading-tight tracking-tight text-[var(--bg)] sm:text-5xl md:text-6xl lg:text-7xl">
            {page.title}
          </h1>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Post Body Section (journal-post-body)
 */
export function JournalPostBodySection({ section, page }: CMSSectionProps) {
  return (
    <article
      data-section-id={section.id}
      data-definition-key={section.definition_key}
      data-template-sku={section.template_sku || "tpl-journal-post-body-default"}
      className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="prose prose-lg prose-stone max-w-none prose-headings:font-serif prose-headings:font-medium prose-headings:tracking-tight prose-p:leading-relaxed prose-p:text-[var(--text-muted)] prose-a:text-[var(--accent)] prose-a:no-underline hover:prose-a:underline"
      >
        {section.blocks.map((block) => (
          <RenderBlock key={block.id} block={block} section={section} page={page} />
        ))}
      </motion.div>
    </article>
  );
}

/**
 * About Profile Section (journal-about-profile)
 */
export function JournalAboutProfileSection({ section, page }: CMSSectionProps<{
  portrait_asset_id?: string;
  heading?: string;
  bio_quote?: string;
  inquiries_title?: string;
  email?: string;
  twitter?: string;
  instagram?: string;
}>) {
  const data = section.section_data || {};
  const portraitAsset = resolveAsset(data.portrait_asset_id || "asset-author-portrait");
  const heading = data.heading || "About Jane";
  const bioQuote = data.bio_quote || "Documenting the quiet moments between the noise.";
  const inquiries = data.inquiries_title || "Connect & Inquiries";
  const email = data.email || "hello@janedoe.com";
  const twitter = data.twitter || "@janedoe";
  const instagram = data.instagram || "@jane.captures";

  return (
    <article
      data-section-id={section.id}
      data-definition-key={section.definition_key}
      data-template-sku={section.template_sku || "tpl-journal-about-profile-default"}
      className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col md:flex-row gap-12 lg:gap-20 items-start"
      >
        <div className="w-full md:w-1/2">
          <div className="aspect-[4/5] overflow-hidden rounded-sm bg-[var(--border-subtle)] sticky top-24">
            <FadeImage
              src={portraitAsset.url}
              alt={portraitAsset.alt_text || heading}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="w-full md:w-1/2 flex flex-col justify-center pt-8 md:pt-0">
          <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-medium text-[var(--text)] mb-8 tracking-tight">
            {heading}
          </h1>
          <div className="prose prose-stone prose-lg prose-p:leading-relaxed prose-p:text-[var(--text-muted)]">
            <p className="text-2xl font-serif italic text-[var(--text)] mb-8 leading-snug">
              {bioQuote}
            </p>
            {section.blocks.map((block) => (
              <RenderBlock key={block.id} block={block} section={section} page={page} />
            ))}
          </div>

          <div className="mt-16 pt-12 border-t border-[var(--border-divider)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text)] mb-6">
              {inquiries}
            </h3>
            <div className="flex flex-col gap-4">
              <a href={`mailto:${email}`} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors font-medium">
                {email}
              </a>
              <a href="#" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors font-medium">
                Twitter: {twitter}
              </a>
              <a href="#" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors font-medium">
                Instagram: {instagram}
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    </article>
  );
}

/**
 * Photo Gallery Section (journal-photo-gallery)
 */
export function JournalPhotoGallerySection({ section, page }: CMSSectionProps<{
  title?: string;
  description?: string;
}>) {
  const [selectedPhoto, setSelectedPhoto] = React.useState<{ src: string; alt: string; caption?: string } | null>(null);
  const data = section.section_data || {};
  const title = data.title || "Selected Works";
  const desc = data.description || "A collection of moments captured across different cities and landscapes.";

  return (
    <div
      data-section-id={section.id}
      data-definition-key={section.definition_key}
      data-template-sku={section.template_sku || "tpl-journal-photo-gallery-default"}
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          <h1 className="font-serif text-5xl font-medium tracking-tight text-[var(--text)] md:text-6xl">
            {title}
          </h1>
          <p className="mt-4 text-lg text-[var(--text-muted)] max-w-2xl">
            {desc}
          </p>
        </motion.div>
      </div>

      <div className="w-full px-1 pb-1">
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-1 space-y-1">
          {section.blocks.map((block) => (
            <PhotoItemWithLightbox
              key={block.id}
              block={block}
              section={section}
              page={page}
              onSelect={setSelectedPhoto}
            />
          ))}
        </div>
      </div>

      <Lightbox
        isOpen={selectedPhoto !== null}
        onClose={() => setSelectedPhoto(null)}
        src={selectedPhoto?.src || ""}
        alt={selectedPhoto?.alt || ""}
        caption={selectedPhoto?.caption || ""}
      />
    </div>
  );
}

// ----------------------------------------------------
// Block Implementations
// ----------------------------------------------------

/**
 * Article Card Block (journal-article-card)
 */
export function JournalArticleCardBlock({ block }: CMSBlockProps<{
  slug?: string;
  title?: string;
  excerpt?: string;
  date?: string;
  read_time?: string;
  category?: string;
  cover_asset_id?: string;
  author_name?: string;
  author_avatar_asset_id?: string;
  featured?: boolean;
}>) {
  const content = block.content_json || {};
  const isFeatured = !!content.featured;
  const coverAsset = resolveAsset(content.cover_asset_id);
  const avatarAsset = resolveAsset(content.author_avatar_asset_id || "asset-author-avatar");
  const postUrl = `/post/${content.slug || ""}`;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: block.block_order * 0.08, ease: [0.16, 1, 0.3, 1] }}
      data-block-id={block.id}
      data-block-key={block.definition_key}
      data-definition-key={block.definition_key}
      data-template-sku={block.template_sku || (isFeatured ? "tpl-journal-article-card-featured" : "tpl-journal-article-card-standard")}
      className={`group flex flex-col gap-6 ${isFeatured ? "md:flex-row md:items-center md:gap-12" : ""}`}
    >
      <Link
        to={postUrl}
        className={`block overflow-hidden rounded-sm bg-[var(--border-subtle)] ${
          isFeatured ? "aspect-[16/9] md:aspect-[4/3] md:w-3/5" : "aspect-[4/3] w-full"
        }`}
      >
        <FadeImage
          src={coverAsset.url}
          alt={coverAsset.alt_text || content.title || "Article cover"}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover group-hover:scale-105"
          loading="lazy"
        />
      </Link>

      <div className={`flex flex-col ${isFeatured ? "md:w-2/5" : ""}`}>
        <div className="mb-3 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {content.date && <span>{content.date}</span>}
          {content.date && content.category && <span className="h-1 w-1 rounded-full bg-[var(--border-input)]" />}
          {content.category && <span>{content.category}</span>}
        </div>

        <Link to={postUrl} className="group-hover:text-[var(--accent)] transition-colors">
          <h2
            className={`font-serif leading-tight text-[var(--text)] ${
              isFeatured ? "text-3xl md:text-5xl mb-4" : "text-2xl mb-3"
            }`}
          >
            {content.title}
          </h2>
        </Link>

        <p
          className={`text-[var(--text-muted)] leading-relaxed ${
            isFeatured ? "text-lg mb-6" : "text-sm mb-4 line-clamp-3"
          }`}
        >
          {content.excerpt}
        </p>

        <div className="mt-auto flex items-center gap-3">
          <FadeImage
            src={avatarAsset.url}
            alt={avatarAsset.alt_text || content.author_name || "Author"}
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-full object-cover grayscale"
          />
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[var(--text)]">{content.author_name}</span>
            <span className="text-xs text-[var(--text-muted)]">{content.read_time}</span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

/**
 * Lead Paragraph Block (journal-lead-paragraph)
 */
export function JournalLeadParagraphBlock({ block }: CMSBlockProps<{ text?: string }>) {
  return (
    <p
      data-block-id={block.id}
      data-block-key={block.definition_key}
      data-definition-key={block.definition_key}
      data-template-sku={block.template_sku || "tpl-journal-lead-paragraph-default"}
      className="lead text-2xl font-serif italic text-[var(--text)] mb-12"
    >
      {block.content_json?.text}
    </p>
  );
}

/**
 * Text Block (journal-text-block)
 */
export function JournalTextBlockBlock({ block }: CMSBlockProps<{ text?: string; html?: string }>) {
  return (
    <div
      data-block-id={block.id}
      data-block-key={block.definition_key}
      data-definition-key={block.definition_key}
      data-template-sku={block.template_sku || "tpl-journal-text-block-default"}
    >
      {block.content_json?.html ? (
        <div dangerouslySetInnerHTML={{ __html: block.content_json.html }} />
      ) : (
        <p>{block.content_json?.text}</p>
      )}
    </div>
  );
}

/**
 * Heading Block (journal-heading-block)
 */
export function JournalHeadingBlockBlock({ block }: CMSBlockProps<{ text?: string; level?: number }>) {
  const content = block.content_json || {};
  const HeadingTag = content.level === 3 ? "h3" : content.level === 4 ? "h4" : "h2";
  return (
    <HeadingTag
      data-block-id={block.id}
      data-block-key={block.definition_key}
      data-definition-key={block.definition_key}
      data-template-sku={block.template_sku || "tpl-journal-heading-block-default"}
      className="text-3xl mt-16 mb-8 text-[var(--text)] font-serif font-medium tracking-tight"
    >
      {content.text}
    </HeadingTag>
  );
}

/**
 * Quote Embed Block (journal-quote-embed)
 */
export function JournalQuoteEmbedBlock({ block }: CMSBlockProps<{
  quote?: string;
  author?: string;
  source?: string;
}>) {
  const content = block.content_json || {};
  return (
    <motion.blockquote
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      data-block-id={block.id}
      data-block-key={block.definition_key}
      data-definition-key={block.definition_key}
      data-template-sku={block.template_sku || "tpl-journal-quote-embed-default"}
      className="my-16 mx-auto max-w-3xl border-l-2 border-[var(--accent)] pl-6 sm:pl-8 pr-4 sm:pr-0 py-4 not-italic"
    >
      <p className="font-serif text-2xl italic leading-relaxed text-[var(--text)] md:text-3xl">
        &ldquo;{content.quote}&rdquo;
      </p>
      {(content.author || content.source) && (
        <footer className="mt-6 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {content.author && <span>{content.author}</span>}
          {content.author && content.source && <span className="h-1 w-1 rounded-full bg-[var(--border-input)]" />}
          {content.source && <cite className="normal-case italic">{content.source}</cite>}
        </footer>
      )}
    </motion.blockquote>
  );
}

/**
 * Image Embed Block (journal-image-embed)
 */
export function JournalImageEmbedBlock({ block }: CMSBlockProps<{
  asset_id?: string;
  alt?: string;
  caption?: string;
  size?: "default" | "wide" | "full";
}>) {
  const [isOpen, setIsOpen] = React.useState(false);
  const content = block.content_json || {};
  const asset = resolveAsset(content.asset_id);
  const size = content.size || "default";

  return (
    <>
      <motion.figure
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        data-block-id={block.id}
        data-block-key={block.definition_key}
        data-definition-key={block.definition_key}
        data-template-sku={block.template_sku || `tpl-journal-image-embed-${size}`}
        className={`my-16 mx-auto ${
          size === "default" ? "max-w-4xl px-4 sm:px-6 lg:px-8" : size === "wide" ? "max-w-6xl px-4 sm:px-6 lg:px-8" : "w-full max-w-none"
        }`}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="w-full overflow-hidden rounded-sm bg-[var(--border-subtle)] cursor-zoom-in group text-left"
        >
          <FadeImage
            src={asset.url}
            alt={content.alt || asset.alt_text || "Embedded photo"}
            referrerPolicy="no-referrer"
            className="w-full h-auto object-cover group-hover:scale-[1.02]"
            loading="lazy"
          />
        </button>
        {content.caption && (
          <figcaption className="mt-4 text-center text-sm italic text-[var(--text-muted)] max-w-2xl mx-auto px-4">
            {content.caption}
          </figcaption>
        )}
      </motion.figure>

      <Lightbox
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        src={asset.url}
        alt={content.alt || asset.alt_text || ""}
        caption={content.caption}
      />
    </>
  );
}

/**
 * Gallery Embed Block (journal-gallery-embed)
 */
export function JournalGalleryEmbedBlock({ block }: CMSBlockProps<{
  images?: Array<{ asset_id: string; alt: string; caption?: string }>;
  caption?: string;
}>) {
  const [selectedPhoto, setSelectedPhoto] = React.useState<{ src: string; alt: string; caption?: string } | null>(null);
  const content = block.content_json || {};
  const images = (content.images || []).map((img) => {
    const asset = resolveAsset(img.asset_id);
    return {
      src: asset.url,
      alt: img.alt || asset.alt_text,
      caption: img.caption || asset.caption,
    };
  });

  return (
    <>
      <figure
        data-block-id={block.id}
        data-block-key={block.definition_key}
        data-definition-key={block.definition_key}
        data-template-sku={block.template_sku || "tpl-journal-gallery-embed-default"}
        className="my-16 w-full max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {images.map((img, idx) => (
            <motion.button
              key={idx}
              onClick={() => setSelectedPhoto(img)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
              className={`overflow-hidden rounded-sm bg-[var(--border-subtle)] cursor-zoom-in group ${
                idx === 0 ? "sm:col-span-2 sm:row-span-2" : ""
              }`}
            >
              <FadeImage
                src={img.src}
                alt={img.alt}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover group-hover:scale-105"
                style={{ minHeight: idx === 0 ? "100%" : "300px" }}
              />
            </motion.button>
          ))}
        </div>
        {(content.caption || images.some((img) => img.caption)) && (
          <figcaption className="mt-4 text-center text-sm italic text-[var(--text-muted)]">
            {content.caption || images.find((img) => img.caption)?.caption}
          </figcaption>
        )}
      </figure>

      <Lightbox
        isOpen={selectedPhoto !== null}
        onClose={() => setSelectedPhoto(null)}
        src={selectedPhoto?.src || ""}
        alt={selectedPhoto?.alt || ""}
        caption={selectedPhoto?.caption || ""}
      />
    </>
  );
}

/**
 * Author Bio Block (journal-author-bio)
 */
export function JournalAuthorBioBlock({ block }: CMSBlockProps<{
  name?: string;
  bio?: string;
  avatar_asset_id?: string;
  twitter?: string;
  instagram?: string;
}>) {
  const content = block.content_json || {};
  const avatarAsset = resolveAsset(content.avatar_asset_id || "asset-author-avatar");

  return (
    <div
      data-block-id={block.id}
      data-block-key={block.definition_key}
      data-definition-key={block.definition_key}
      data-template-sku={block.template_sku || "tpl-journal-author-bio-default"}
      className="mt-24 border-t border-[var(--border-divider)] pt-12"
    >
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
        <img
          src={avatarAsset.url}
          alt={content.name || "Author portrait"}
          referrerPolicy="no-referrer"
          className="h-24 w-24 rounded-full object-cover grayscale shrink-0"
        />
        <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
          <h3 className="font-serif text-2xl font-medium tracking-tight text-[var(--text)]">
            Written by {content.name}
          </h3>
          <p className="mt-3 max-w-md text-[var(--text-muted)] leading-relaxed">
            {content.bio}
          </p>
          <div className="mt-4 flex gap-4 text-sm font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {content.twitter && <a href="#" className="hover:text-[var(--accent)] transition-colors">Twitter</a>}
            {content.instagram && <a href="#" className="hover:text-[var(--accent)] transition-colors">Instagram</a>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Navigation Link Block (journal-nav-link)
 */
export function JournalNavLinkBlock({ block }: CMSBlockProps<{
  label?: string;
  path?: string;
  is_external?: boolean;
}>) {
  const content = block.content_json || {};
  return (
    <div
      data-block-id={block.id}
      data-block-key={block.definition_key}
      data-definition-key={block.definition_key}
      data-template-sku={block.template_sku || "tpl-journal-nav-link-default"}
      className="inline-block"
    >
      {content.is_external ? (
        <a
          href={content.path || "#"}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors"
        >
          {content.label}
        </a>
      ) : (
        <Link
          to={content.path || "/"}
          className="text-sm text-[var(--text)] hover:text-[var(--accent)] transition-colors"
        >
          {content.label}
        </Link>
      )}
    </div>
  );
}

/**
 * Photo Item Block with lightbox integration
 */
function PhotoItemWithLightbox({
  block,
  onSelect,
}: CMSBlockProps<{
  asset_id?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}> & {
  onSelect: (photo: { src: string; alt: string; caption?: string }) => void;
}) {
  const content = block.content_json || {};
  const asset = resolveAsset(content.asset_id);
  const caption = content.caption || asset.caption;
  const alt = content.alt || asset.alt_text;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "100px" }}
      transition={{ duration: 0.6, delay: (block.block_order % 4) * 0.1 }}
      onClick={() => onSelect({ src: asset.url, alt, caption })}
      data-block-id={block.id}
      data-block-key={block.definition_key}
      data-definition-key={block.definition_key}
      data-template-sku={block.template_sku || "tpl-journal-photo-item-default"}
      className="group relative block w-full break-inside-avoid overflow-hidden bg-[var(--border-subtle)] cursor-zoom-in text-left"
    >
      <FadeImage
        src={asset.url}
        alt={alt}
        width={content.width || asset.width}
        height={content.height || asset.height}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="w-full h-auto object-cover group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--overlay-scrim)] via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      {caption && (
        <div className="absolute bottom-0 left-0 w-full p-6 translate-y-4 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="text-[var(--bg)] font-serif text-lg tracking-wide">{caption}</p>
        </div>
      )}
    </motion.button>
  );
}

/**
 * Fallback Unregistered Component Placeholder
 * Renders a visible placeholder and NEVER throws.
 */
export function UnregisteredComponentPlaceholder({
  definitionKey,
  type = "component",
}: {
  definitionKey: string;
  type?: "section" | "block" | "component";
}) {
  return (
    <div className="my-4 rounded-sm border-2 border-dashed border-[var(--accent)]/50 bg-[var(--accent)]/5 p-6 text-center">
      <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
        <span>[CMS Registry]</span>
        <span>Unregistered {type}</span>
      </div>
      <p className="mt-2 font-mono text-sm text-[var(--text)]">
        unregistered: <span className="font-bold underline">{definitionKey}</span>
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Register this definition_key in <code>src/render/registry.tsx</code> to enable rendering.
      </p>
    </div>
  );
}

// ----------------------------------------------------
// Registry Map
// ----------------------------------------------------

export const componentRegistry = new Map<string, CMSComponentType>([
  // Sections
  ["journal-header", JournalHeaderSection],
  ["journal-footer", JournalFooterSection],
  ["journal-home-hero", JournalHomeHeroSection],
  ["journal-latest-entries", JournalLatestEntriesSection],
  ["journal-post-hero", JournalPostHeroSection],
  ["journal-post-body", JournalPostBodySection],
  ["journal-about-profile", JournalAboutProfileSection],
  ["journal-photo-gallery", JournalPhotoGallerySection],

  // Blocks
  ["journal-article-card", JournalArticleCardBlock],
  ["journal-lead-paragraph", JournalLeadParagraphBlock],
  ["journal-text-block", JournalTextBlockBlock],
  ["journal-heading-block", JournalHeadingBlockBlock],
  ["journal-quote-embed", JournalQuoteEmbedBlock],
  ["journal-image-embed", JournalImageEmbedBlock],
  ["journal-gallery-embed", JournalGalleryEmbedBlock],
  ["journal-author-bio", JournalAuthorBioBlock],
  ["journal-nav-link", JournalNavLinkBlock],
]);

// ----------------------------------------------------
// Dispatch Renderers with Fallbacks
// ----------------------------------------------------

export function RenderSection({ section, page }: CMSSectionProps) {
  const Component = componentRegistry.get(section.definition_key);
  if (!Component) {
    return <UnregisteredComponentPlaceholder definitionKey={section.definition_key} type="section" />;
  }
  return <Component section={section} page={page} />;
}

export function RenderBlock({ block, section, page }: CMSBlockProps) {
  const Component = componentRegistry.get(block.definition_key);
  if (!Component) {
    return <UnregisteredComponentPlaceholder definitionKey={block.definition_key} type="block" />;
  }
  return <Component block={block} section={section} page={page} />;
}
