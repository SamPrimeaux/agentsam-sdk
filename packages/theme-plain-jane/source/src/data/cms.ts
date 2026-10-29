/**
 * Read-Only Typed CMS Data Layer
 * Maps Page -> Section[] -> Block[] with manifest export, asset resolution,
 * and built-in fixture adapter.
 */

import { useEffect } from "react";
import { cmsConfig } from "../../cms.config";

export interface CMSAsset {
  id: string;
  account_id?: string;
  url: string;
  alt_text: string;
  width?: number;
  height?: number;
  caption?: string;
  mime_type?: string;
}

export interface CMSBlock<T = Record<string, unknown>> {
  id: string;
  section_id: string;
  definition_key: string;
  version?: string;
  template_sku?: string;
  block_order: number;
  content_json: T;
  status: "active" | "draft" | "archived";
}

export interface CMSSection<TSettings = Record<string, unknown>> {
  id: string;
  page_id: string;
  definition_key: string;
  version?: string;
  template_sku?: string;
  section_order: number;
  section_data: TSettings;
  status: "active" | "draft" | "archived";
  blocks: CMSBlock<Record<string, unknown>>[];
}

export type CMSPageType =
  | "blog"
  | "post"
  | "case_study"
  | "work"
  | "about"
  | "contact"
  | "404"
  | "legal";

export interface CMSPageSEO {
  title: string;
  description: string;
  og_image_asset_id?: string;
}

export interface CMSPage {
  id: string;
  site_id: string;
  project_slug: string;
  page_type: CMSPageType;
  slug: string;
  title: string;
  status: "published" | "draft" | "archived";
  created_at: number; // Unix seconds
  updated_at: number; // Unix seconds
  published_at: number | null; // Unix seconds
  seo_json?: CMSPageSEO;
  og_image_asset_id?: string;
  sections: CMSSection[];
  metadata?: Record<string, unknown>;
}

// ----------------------------------------------------
// Manifest & Registry Export Helpers
// ----------------------------------------------------

export interface PageManifestBlock {
  id: string;
  definition_key: string;
  version: string;
  template_sku: string;
  block_order: number;
}

export interface PageManifestSection {
  id: string;
  definition_key: string;
  version: string;
  template_sku: string;
  section_order: number;
  blocks: PageManifestBlock[];
}

export interface PageManifest {
  page_id: string;
  slug: string;
  title: string;
  page_type: CMSPageType;
  sections: PageManifestSection[];
}

/**
 * Returns ordered Section[] -> Block[] manifest with IDs and SKUs
 * for external CMS overlay editor binding.
 */
export function getPageManifest(page: CMSPage): PageManifest {
  return {
    page_id: page.id,
    slug: page.slug,
    title: page.title,
    page_type: page.page_type,
    sections: page.sections
      .slice()
      .sort((a, b) => a.section_order - b.section_order)
      .map((sec) => ({
        id: sec.id,
        definition_key: sec.definition_key,
        version: sec.version || "1.0.0",
        template_sku: sec.template_sku || `tpl-${sec.definition_key}-default`,
        section_order: sec.section_order,
        blocks: sec.blocks
          .slice()
          .sort((a, b) => a.block_order - b.block_order)
          .map((blk) => ({
            id: blk.id,
            definition_key: blk.definition_key,
            version: blk.version || "1.0.0",
            template_sku: blk.template_sku || `tpl-${blk.definition_key}-default`,
            block_order: blk.block_order,
          })),
      })),
  };
}

/**
 * Returns every registered definition_key in this add-in
 */
export function cmsRegistryKeys(): string[] {
  return [
    "journal-header",
    "journal-footer",
    "journal-home-hero",
    "journal-latest-entries",
    "journal-post-hero",
    "journal-post-body",
    "journal-about-profile",
    "journal-photo-gallery",
    "journal-article-card",
    "journal-lead-paragraph",
    "journal-text-block",
    "journal-heading-block",
    "journal-quote-embed",
    "journal-image-embed",
    "journal-gallery-embed",
    "journal-author-bio",
    "journal-photo-item",
    "journal-nav-link",
  ];
}

// ----------------------------------------------------
// Original Local SVG Assets Store
// ----------------------------------------------------

export const assetsStore: Record<string, CMSAsset> = {
  "asset-app-logo": {
    id: "asset-app-logo",
    url: "/icons/app-logo.svg",
    alt_text: "Plain Jane Journal Monogram Logo",
    width: 64,
    height: 64,
  },
  "asset-author-avatar": {
    id: "asset-author-avatar",
    url: "/images/author-avatar.svg",
    alt_text: "Jane Doe avatar silhouette",
    width: 200,
    height: 200,
  },
  "asset-author-portrait": {
    id: "asset-author-portrait",
    url: "/images/author-portrait.svg",
    alt_text: "Jane Doe profile portrait study",
    width: 800,
    height: 1000,
  },
  "asset-cover-slow-travel": {
    id: "asset-cover-slow-travel",
    url: "/images/cover-slow-travel.svg",
    alt_text: "The Art of Slow Travel cover study",
    width: 1200,
    height: 800,
  },
  "asset-cover-analog": {
    id: "asset-cover-analog",
    url: "/images/cover-analog.svg",
    alt_text: "Analog shutter and mechanical precision study",
    width: 1200,
    height: 800,
  },
  "asset-cover-morning": {
    id: "asset-cover-morning",
    url: "/images/cover-morning.svg",
    alt_text: "Morning rituals and morning light geometry",
    width: 1200,
    height: 800,
  },
  "asset-cover-silence": {
    id: "asset-cover-silence",
    url: "/images/cover-silence.svg",
    alt_text: "Architecture of silence concrete geometry",
    width: 1200,
    height: 800,
  },
  "asset-cover-memory": {
    id: "asset-cover-memory",
    url: "/images/cover-memory.svg",
    alt_text: "The taste of memory vessel study",
    width: 1200,
    height: 800,
  },
  "asset-embed-architecture": {
    id: "asset-embed-architecture",
    url: "/images/embed-architecture.svg",
    alt_text: "Minimalist spatial aperture study",
    caption: "The interplay of light and shadow creates a natural rhythm that encourages reflection.",
    width: 1200,
    height: 800,
  },
  "asset-gallery-1": {
    id: "asset-gallery-1",
    url: "/images/gallery-1.svg",
    alt_text: "Morning light study across table",
    caption: "Morning light",
    width: 1200,
    height: 800,
  },
  "asset-gallery-2": {
    id: "asset-gallery-2",
    url: "/images/gallery-2.svg",
    alt_text: "Ceramic vessels and steam study",
    caption: "Coffee cup",
    width: 1200,
    height: 800,
  },
  "asset-gallery-3": {
    id: "asset-gallery-3",
    url: "/images/gallery-3.svg",
    alt_text: "Open clothbound ledger study",
    caption: "Open book",
    width: 1200,
    height: 800,
  },
  "asset-case-kyoto-cover": {
    id: "asset-case-kyoto-cover",
    url: "/images/cover-case-kyoto.svg",
    alt_text: "Kyoto wooden temple courtyard spatial survey",
    width: 1200,
    height: 800,
  },
  "asset-case-kyoto-detail": {
    id: "asset-case-kyoto-detail",
    url: "/images/embed-kyoto-detail.svg",
    alt_text: "Tatami mats and sliding shoji partition survey",
    caption: "Material simplicity and deliberate shadows frame inner contemplation.",
    width: 1200,
    height: 800,
  },
  "asset-case-nordic-cover": {
    id: "asset-case-nordic-cover",
    url: "/images/cover-case-nordic.svg",
    alt_text: "Nordic coastal fjord low-angle sun observation",
    width: 1200,
    height: 800,
  },
  "asset-case-nordic-detail": {
    id: "asset-case-nordic-detail",
    url: "/images/embed-nordic-detail.svg",
    alt_text: "Subtle horizon gradient between sea and pale cloud",
    caption: "Low sun angles create prolonged golden transitions across natural surfaces.",
    width: 1200,
    height: 800,
  },
  "asset-og-default": {
    id: "asset-og-default",
    url: "/images/og-journal.svg",
    alt_text: "Plain Jane Journal OpenGraph Preview Card",
    width: 1200,
    height: 800,
  },
  "asset-photo-1": { id: "asset-photo-1", url: "/images/photo-1.svg", alt_text: "Urban landscape", caption: "Tokyo, 2023", width: 1200, height: 800 },
  "asset-photo-2": { id: "asset-photo-2", url: "/images/photo-2.svg", alt_text: "Mountain range", caption: "Swiss Alps", width: 1200, height: 800 },
  "asset-photo-3": { id: "asset-photo-3", url: "/images/photo-3.svg", alt_text: "Coffee shop", caption: "Morning rituals", width: 1200, height: 800 },
  "asset-photo-4": { id: "asset-photo-4", url: "/images/photo-4.svg", alt_text: "Street photography", caption: "Shadows and light", width: 1200, height: 800 },
  "asset-photo-5": { id: "asset-photo-5", url: "/images/photo-5.svg", alt_text: "Portrait", caption: "Strangers", width: 1200, height: 800 },
  "asset-photo-6": { id: "asset-photo-6", url: "/images/photo-6.svg", alt_text: "Ocean waves", caption: "Pacific coast", width: 1200, height: 800 },
  "asset-photo-7": { id: "asset-photo-7", url: "/images/photo-7.svg", alt_text: "Architecture", caption: "Concrete geometry", width: 1200, height: 800 },
  "asset-photo-8": { id: "asset-photo-8", url: "/images/photo-8.svg", alt_text: "Forest path", caption: "Into the woods", width: 1200, height: 800 },
  "asset-photo-9": { id: "asset-photo-9", url: "/images/photo-9.svg", alt_text: "Desert dunes", caption: "Golden hour", width: 1200, height: 800 },
  "asset-photo-10": { id: "asset-photo-10", url: "/images/photo-10.svg", alt_text: "City lights", caption: "Midnight", width: 1200, height: 800 },
  "asset-photo-11": { id: "asset-photo-11", url: "/images/photo-11.svg", alt_text: "Still life", caption: "Details", width: 1200, height: 800 },
  "asset-photo-12": { id: "asset-photo-12", url: "/images/photo-12.svg", alt_text: "Canyon", caption: "Vastness", width: 1200, height: 800 },
};

export function resolveAsset(assetId?: string): CMSAsset {
  if (assetId && assetsStore[assetId]) {
    const asset = assetsStore[assetId];
    const url = asset.url.startsWith('/') && !asset.url.startsWith('//')
      ? import.meta.env.BASE_URL.replace(/\/?$/, '/') + asset.url.slice(1)
      : asset.url;
    return { ...asset, url };
  }
  return {
    id: assetId || "asset-placeholder",
    url: import.meta.env.BASE_URL.replace(/\/?$/, '/') + "images/cover-slow-travel.svg",
    alt_text: "Placeholder image",
    width: 1200,
    height: 800,
  };
}

// ----------------------------------------------------
// Fixture Seed Data (Deterministic IDs derived from keys)
// ----------------------------------------------------

const fixturePages: CMSPage[] = [
  // 1. Home / Blog Index
  {
    id: "page-journal-home",
    site_id: "site-plain-jane",
    project_slug: cmsConfig.siteSlug,
    page_type: "blog",
    slug: "home",
    title: "Notes on a quieter life",
    status: "published",
    created_at: 1696118400,
    updated_at: 1696118400,
    published_at: 1696118400,
    seo_json: {
      title: "Plain Jane Journal — Notes on a quieter life",
      description: "Essays, photography, and reflections on finding meaning in the spaces between the noise.",
      og_image_asset_id: "asset-og-default",
    },
    og_image_asset_id: "asset-og-default",
    sections: [
      {
        id: "sec-home-hero",
        page_id: "page-journal-home",
        definition_key: "journal-home-hero",
        version: "1.0.0",
        template_sku: "tpl-journal-home-hero-default",
        section_order: 1,
        section_data: {
          title_prefix: "Notes on a ",
          title_highlight: "quieter",
          title_suffix: " life.",
          subtitle: "Essays, photography, and reflections on finding meaning in the spaces between the noise.",
        },
        status: "active",
        blocks: [
          {
            id: "blk-home-hero-card",
            section_id: "sec-home-hero",
            definition_key: "journal-article-card",
            version: "1.0.0",
            template_sku: "tpl-journal-article-card-featured",
            block_order: 1,
            status: "active",
            content_json: {
              slug: "the-art-of-slow-travel",
              title: "The Art of Slow Travel: Finding Meaning in the In-Between",
              excerpt: "Why rushing from landmark to landmark is ruining our ability to truly experience the world around us.",
              date: "October 12, 2023",
              read_time: "8 min read",
              category: "Travel",
              cover_asset_id: "asset-cover-slow-travel",
              author_name: "Jane Doe",
              author_avatar_asset_id: "asset-author-avatar",
              featured: true,
            },
          },
        ],
      },
      {
        id: "sec-home-entries",
        page_id: "page-journal-home",
        definition_key: "journal-latest-entries",
        version: "1.0.0",
        template_sku: "tpl-journal-latest-entries-default",
        section_order: 2,
        section_data: {
          section_title: "Latest Entries",
          view_all_label: "View All",
          view_all_path: "#",
        },
        status: "active",
        blocks: [
          {
            id: "blk-home-entry-1",
            section_id: "sec-home-entries",
            definition_key: "journal-article-card",
            version: "1.0.0",
            template_sku: "tpl-journal-article-card-standard",
            block_order: 1,
            status: "active",
            content_json: {
              slug: "analog-photography-digital-age",
              title: "Embracing Analog in a Hyper-Digital Age",
              excerpt: "There is something profoundly grounding about the mechanical click of a shutter and the anticipation of developing film.",
              date: "September 28, 2023",
              read_time: "5 min read",
              category: "Photography",
              cover_asset_id: "asset-cover-analog",
              author_name: "Jane Doe",
              author_avatar_asset_id: "asset-author-avatar",
              featured: false,
            },
          },
          {
            id: "blk-home-entry-2",
            section_id: "sec-home-entries",
            definition_key: "journal-article-card",
            version: "1.0.0",
            template_sku: "tpl-journal-article-card-standard",
            block_order: 2,
            status: "active",
            content_json: {
              slug: "morning-rituals",
              title: "Morning Rituals That Actually Work",
              excerpt: "Beyond the 5 AM club: finding a morning routine that respects your natural rhythms rather than fighting them.",
              date: "September 15, 2023",
              read_time: "6 min read",
              category: "Lifestyle",
              cover_asset_id: "asset-cover-morning",
              author_name: "Jane Doe",
              author_avatar_asset_id: "asset-author-avatar",
              featured: false,
            },
          },
          {
            id: "blk-home-entry-3",
            section_id: "sec-home-entries",
            definition_key: "journal-article-card",
            version: "1.0.0",
            template_sku: "tpl-journal-article-card-standard",
            block_order: 3,
            status: "active",
            content_json: {
              slug: "architecture-of-silence",
              title: "The Architecture of Silence",
              excerpt: "Exploring spaces designed specifically to cultivate quiet and reflection in modern cities.",
              date: "August 30, 2023",
              read_time: "10 min read",
              category: "Design",
              cover_asset_id: "asset-cover-silence",
              author_name: "Jane Doe",
              author_avatar_asset_id: "asset-author-avatar",
              featured: false,
            },
          },
          {
            id: "blk-home-entry-4",
            section_id: "sec-home-entries",
            definition_key: "journal-article-card",
            version: "1.0.0",
            template_sku: "tpl-journal-article-card-standard",
            block_order: 4,
            status: "active",
            content_json: {
              slug: "taste-of-memory",
              title: "The Taste of Memory",
              excerpt: "How a simple bowl of broth transported me back to a rainy afternoon in Kyoto.",
              date: "August 12, 2023",
              read_time: "4 min read",
              category: "Food",
              cover_asset_id: "asset-cover-memory",
              author_name: "Jane Doe",
              author_avatar_asset_id: "asset-author-avatar",
              featured: false,
            },
          },
        ],
      },
    ],
  },

  // 2. Post 1: The Art of Slow Travel
  {
    id: "page-journal-post-slow-travel",
    site_id: "site-plain-jane",
    project_slug: cmsConfig.siteSlug,
    page_type: "post",
    slug: "the-art-of-slow-travel",
    title: "The Art of Slow Travel: Finding Meaning in the In-Between",
    status: "published",
    created_at: 1697112000,
    updated_at: 1697112000,
    published_at: 1697112000,
    seo_json: {
      title: "The Art of Slow Travel — Plain Jane Journal",
      description: "Why rushing from landmark to landmark is ruining our ability to truly experience the world around us.",
      og_image_asset_id: "asset-cover-slow-travel",
    },
    og_image_asset_id: "asset-cover-slow-travel",
    metadata: {
      date: "October 12, 2023",
      category: "Travel",
      read_time: "8 min read",
      cover_asset_id: "asset-cover-slow-travel",
      excerpt: "Why rushing from landmark to landmark is ruining our ability to truly experience the world around us.",
    },
    sections: [
      {
        id: "sec-post-1-hero",
        page_id: "page-journal-post-slow-travel",
        definition_key: "journal-post-hero",
        version: "1.0.0",
        template_sku: "tpl-journal-post-hero-default",
        section_order: 1,
        section_data: { show_gradient: true, min_height: "500px" },
        status: "active",
        blocks: [],
      },
      {
        id: "sec-post-1-body",
        page_id: "page-journal-post-slow-travel",
        definition_key: "journal-post-body",
        version: "1.0.0",
        template_sku: "tpl-journal-post-body-default",
        section_order: 2,
        section_data: { prose_width: "max-w-3xl" },
        status: "active",
        blocks: [
          {
            id: "blk-p1-lead",
            section_id: "sec-post-1-body",
            definition_key: "journal-lead-paragraph",
            version: "1.0.0",
            template_sku: "tpl-journal-lead-paragraph-default",
            block_order: 1,
            status: "active",
            content_json: {
              text: "Why rushing from landmark to landmark is ruining our ability to truly experience the world around us.",
            },
          },
          {
            id: "blk-p1-text-1",
            section_id: "sec-post-1-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 2,
            status: "active",
            content_json: {
              text: "The modern world demands our constant attention. We are bombarded with notifications, emails, and the endless scroll of social media. In this cacophony, silence has become a luxury, a rare commodity that we must actively seek out and cultivate.",
            },
          },
          {
            id: "blk-p1-text-2",
            section_id: "sec-post-1-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 3,
            status: "active",
            content_json: {
              text: "But what does it mean to truly embrace silence? It is not merely the absence of noise, but a state of being—a profound stillness that allows us to connect with our inner selves and the world around us in a more meaningful way.",
            },
          },
          {
            id: "blk-p1-quote",
            section_id: "sec-post-1-body",
            definition_key: "journal-quote-embed",
            version: "1.0.0",
            template_sku: "tpl-journal-quote-embed-default",
            block_order: 4,
            status: "active",
            content_json: {
              quote: "In the attitude of silence the soul finds the path in a clearer light, and what is elusive and deceptive resolves itself into crystal clearness.",
              author: "Mahatma Gandhi",
            },
          },
          {
            id: "blk-p1-head-1",
            section_id: "sec-post-1-body",
            definition_key: "journal-heading-block",
            version: "1.0.0",
            template_sku: "tpl-journal-heading-block-default",
            block_order: 5,
            status: "active",
            content_json: {
              text: "The Architecture of Quiet Spaces",
              level: 2,
            },
          },
          {
            id: "blk-p1-text-3",
            section_id: "sec-post-1-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 6,
            status: "active",
            content_json: {
              text: "Throughout history, humans have designed spaces specifically to foster contemplation and peace. From the soaring arches of Gothic cathedrals to the minimalist serenity of Japanese Zen gardens, these environments share a common purpose: to quiet the mind and elevate the spirit.",
            },
          },
          {
            id: "blk-p1-img",
            section_id: "sec-post-1-body",
            definition_key: "journal-image-embed",
            version: "1.0.0",
            template_sku: "tpl-journal-image-embed-wide",
            block_order: 7,
            status: "active",
            content_json: {
              asset_id: "asset-embed-architecture",
              alt: "Minimalist architecture",
              caption: "The interplay of light and shadow creates a natural rhythm that encourages reflection.",
              size: "wide",
            },
          },
          {
            id: "blk-p1-text-4",
            section_id: "sec-post-1-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 8,
            status: "active",
            content_json: {
              text: "When we enter these spaces, we instinctively lower our voices. Our breathing slows. We become acutely aware of the subtle details—the texture of stone, the play of light on water, the gentle rustle of leaves. This heightened awareness is the gift of silence.",
            },
          },
          {
            id: "blk-p1-head-2",
            section_id: "sec-post-1-body",
            definition_key: "journal-heading-block",
            version: "1.0.0",
            template_sku: "tpl-journal-heading-block-default",
            block_order: 9,
            status: "active",
            content_json: {
              text: "Cultivating Your Own Sanctuary",
              level: 2,
            },
          },
          {
            id: "blk-p1-gallery",
            section_id: "sec-post-1-body",
            definition_key: "journal-gallery-embed",
            version: "1.0.0",
            template_sku: "tpl-journal-gallery-embed-default",
            block_order: 10,
            status: "active",
            content_json: {
              images: [
                { asset_id: "asset-gallery-1", alt: "Morning light", caption: "Morning light" },
                { asset_id: "asset-gallery-2", alt: "Coffee cup", caption: "Coffee cup" },
                { asset_id: "asset-gallery-3", alt: "Open book", caption: "Open book" },
              ],
            },
          },
          {
            id: "blk-p1-text-5",
            section_id: "sec-post-1-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 11,
            status: "active",
            content_json: {
              text: "Start small. Turn off your phone for an hour. Sit by a window and watch the clouds drift by. Take a walk without headphones. Notice the sounds that emerge when the artificial noise fades away—the hum of the refrigerator, the distant chirp of a bird, the rhythm of your own breath.",
            },
          },
          {
            id: "blk-p1-author",
            section_id: "sec-post-1-body",
            definition_key: "journal-author-bio",
            version: "1.0.0",
            template_sku: "tpl-journal-author-bio-default",
            block_order: 12,
            status: "active",
            content_json: {
              name: "Jane Doe",
              bio: "Documenting the quiet moments between the noise. A journal of travel, photography, and finding meaning in the everyday.",
              avatar_asset_id: "asset-author-avatar",
              twitter: "@janedoe",
              instagram: "@jane.captures",
            },
          },
        ],
      },
    ],
  },

  // 3. Post 2: Embracing Analog in a Hyper-Digital Age
  {
    id: "page-journal-post-analog",
    site_id: "site-plain-jane",
    project_slug: cmsConfig.siteSlug,
    page_type: "post",
    slug: "analog-photography-digital-age",
    title: "Embracing Analog in a Hyper-Digital Age",
    status: "published",
    created_at: 1695859200,
    updated_at: 1695859200,
    published_at: 1695859200,
    seo_json: {
      title: "Embracing Analog — Plain Jane Journal",
      description: "There is something profoundly grounding about the mechanical click of a shutter and the anticipation of developing film.",
      og_image_asset_id: "asset-cover-analog",
    },
    og_image_asset_id: "asset-cover-analog",
    metadata: {
      date: "September 28, 2023",
      category: "Photography",
      read_time: "5 min read",
      cover_asset_id: "asset-cover-analog",
      excerpt: "There is something profoundly grounding about the mechanical click of a shutter and the anticipation of developing film.",
    },
    sections: [
      {
        id: "sec-post-2-hero",
        page_id: "page-journal-post-analog",
        definition_key: "journal-post-hero",
        version: "1.0.0",
        template_sku: "tpl-journal-post-hero-default",
        section_order: 1,
        section_data: { show_gradient: true, min_height: "500px" },
        status: "active",
        blocks: [],
      },
      {
        id: "sec-post-2-body",
        page_id: "page-journal-post-analog",
        definition_key: "journal-post-body",
        version: "1.0.0",
        template_sku: "tpl-journal-post-body-default",
        section_order: 2,
        section_data: { prose_width: "max-w-3xl" },
        status: "active",
        blocks: [
          {
            id: "blk-p2-lead",
            section_id: "sec-post-2-body",
            definition_key: "journal-lead-paragraph",
            version: "1.0.0",
            template_sku: "tpl-journal-lead-paragraph-default",
            block_order: 1,
            status: "active",
            content_json: {
              text: "There is something profoundly grounding about the mechanical click of a shutter and the anticipation of developing film.",
            },
          },
          {
            id: "blk-p2-text-1",
            section_id: "sec-post-2-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 2,
            status: "active",
            content_json: {
              text: "In an era where we capture thousands of images on smartphones only to never look at them again, working with a roll of 36 exposures imposes a deliberate slowness. Each press of the shutter button is a financial and temporal commitment.",
            },
          },
          {
            id: "blk-p2-quote",
            section_id: "sec-post-2-body",
            definition_key: "journal-quote-embed",
            version: "1.0.0",
            template_sku: "tpl-journal-quote-embed-default",
            block_order: 3,
            status: "active",
            content_json: {
              quote: "Limitations produce focus. When you only have thirty-six frames, you learn to look twice before looking through the glass.",
              author: "Anonymous Printmaker",
            },
          },
          {
            id: "blk-p2-text-2",
            section_id: "sec-post-2-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 4,
            status: "active",
            content_json: {
              text: "The tactile sensation of advancing film by thumb, setting manual aperture rings, and looking through an optical prism reconnects the image-maker with physical physics and patience.",
            },
          },
          {
            id: "blk-p2-author",
            section_id: "sec-post-2-body",
            definition_key: "journal-author-bio",
            version: "1.0.0",
            template_sku: "tpl-journal-author-bio-default",
            block_order: 5,
            status: "active",
            content_json: {
              name: "Jane Doe",
              bio: "Documenting the quiet moments between the noise. A journal of travel, photography, and finding meaning in the everyday.",
              avatar_asset_id: "asset-author-avatar",
              twitter: "@janedoe",
              instagram: "@jane.captures",
            },
          },
        ],
      },
    ],
  },

  // 4. About Page
  {
    id: "page-journal-about",
    site_id: "site-plain-jane",
    project_slug: cmsConfig.siteSlug,
    page_type: "about",
    slug: "about",
    title: "About Jane",
    status: "published",
    created_at: 1696118400,
    updated_at: 1696118400,
    published_at: 1696118400,
    seo_json: {
      title: "About Jane — Plain Jane Journal",
      description: "Documenting the quiet moments between the noise. A journal of travel, photography, and finding meaning in the everyday.",
      og_image_asset_id: "asset-author-portrait",
    },
    og_image_asset_id: "asset-author-portrait",
    sections: [
      {
        id: "sec-about-profile",
        page_id: "page-journal-about",
        definition_key: "journal-about-profile",
        version: "1.0.0",
        template_sku: "tpl-journal-about-profile-default",
        section_order: 1,
        section_data: {
          portrait_asset_id: "asset-author-portrait",
          heading: "About Jane",
          bio_quote: "Documenting the quiet moments between the noise. A journal of travel, photography, and finding meaning in the everyday.",
          inquiries_title: "Connect & Inquiries",
          email: "hello@janedoe.com",
          twitter: "@janedoe",
          instagram: "@jane.captures",
        },
        status: "active",
        blocks: [
          {
            id: "blk-about-p1",
            section_id: "sec-about-profile",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 1,
            status: "active",
            content_json: {
              text: "I started this space as a way to document the quiet moments that often go unnoticed. In a world that constantly demands our attention and pushes us to move faster, I found myself craving stillness.",
            },
          },
          {
            id: "blk-about-p2",
            section_id: "sec-about-profile",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 2,
            status: "active",
            content_json: {
              text: "Through my photography and essays, I explore the intersection of travel, mindfulness, and the art of paying attention. Whether I'm wandering through the bustling streets of Tokyo or sitting in a quiet cafe in Paris, my goal is always to capture the essence of a place and the feeling of being fully present in it.",
            },
          },
          {
            id: "blk-about-p3",
            section_id: "sec-about-profile",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 3,
            status: "active",
            content_json: {
              text: "Thank you for being here. I hope these stories inspire you to slow down, look closer, and find your own moments of quiet amidst the noise.",
            },
          },
        ],
      },
    ],
  },

  // 5. Photography / Work Page
  {
    id: "page-journal-photography",
    site_id: "site-plain-jane",
    project_slug: cmsConfig.siteSlug,
    page_type: "work",
    slug: "photography",
    title: "Selected Works",
    status: "published",
    created_at: 1696118400,
    updated_at: 1696118400,
    published_at: 1696118400,
    seo_json: {
      title: "Selected Works — Plain Jane Journal",
      description: "A collection of moments captured across different cities and landscapes.",
      og_image_asset_id: "asset-photo-1",
    },
    og_image_asset_id: "asset-photo-1",
    sections: [
      {
        id: "sec-photo-gallery",
        page_id: "page-journal-photography",
        definition_key: "journal-photo-gallery",
        version: "1.0.0",
        template_sku: "tpl-journal-photo-gallery-default",
        section_order: 1,
        section_data: {
          title: "Selected Works",
          description: "A collection of moments captured across different cities and landscapes. Focusing on light, shadow, and the quiet spaces in between.",
          columns: 4,
        },
        status: "active",
        blocks: [
          { id: "blk-ph-1", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 1, status: "active", content_json: { asset_id: "asset-photo-1", alt: "Urban landscape", caption: "Tokyo, 2023", width: 1200, height: 800 } },
          { id: "blk-ph-2", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 2, status: "active", content_json: { asset_id: "asset-photo-2", alt: "Mountain range", caption: "Swiss Alps", width: 1200, height: 800 } },
          { id: "blk-ph-3", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 3, status: "active", content_json: { asset_id: "asset-photo-3", alt: "Coffee shop", caption: "Morning rituals", width: 1200, height: 800 } },
          { id: "blk-ph-4", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 4, status: "active", content_json: { asset_id: "asset-photo-4", alt: "Street photography", caption: "Shadows and light", width: 1200, height: 800 } },
          { id: "blk-ph-5", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 5, status: "active", content_json: { asset_id: "asset-photo-5", alt: "Portrait", caption: "Strangers", width: 1200, height: 800 } },
          { id: "blk-ph-6", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 6, status: "active", content_json: { asset_id: "asset-photo-6", alt: "Ocean waves", caption: "Pacific coast", width: 1200, height: 800 } },
          { id: "blk-ph-7", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 7, status: "active", content_json: { asset_id: "asset-photo-7", alt: "Architecture", caption: "Concrete geometry", width: 1200, height: 800 } },
          { id: "blk-ph-8", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 8, status: "active", content_json: { asset_id: "asset-photo-8", alt: "Forest path", caption: "Into the woods", width: 1200, height: 800 } },
          { id: "blk-ph-9", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 9, status: "active", content_json: { asset_id: "asset-photo-9", alt: "Desert dunes", caption: "Golden hour", width: 1200, height: 800 } },
          { id: "blk-ph-10", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 10, status: "active", content_json: { asset_id: "asset-photo-10", alt: "City lights", caption: "Midnight", width: 1200, height: 800 } },
          { id: "blk-ph-11", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 11, status: "active", content_json: { asset_id: "asset-photo-11", alt: "Still life", caption: "Details", width: 1200, height: 800 } },
          { id: "blk-ph-12", section_id: "sec-photo-gallery", definition_key: "journal-photo-item", version: "1.0.0", template_sku: "tpl-journal-photo-item-default", block_order: 12, status: "active", content_json: { asset_id: "asset-photo-12", alt: "Canyon", caption: "Vastness", width: 1200, height: 800 } },
        ],
      },
    ],
  },

  // 6. Contact Page
  {
    id: "page-journal-contact",
    site_id: "site-plain-jane",
    project_slug: cmsConfig.siteSlug,
    page_type: "contact",
    slug: "contact",
    title: "Get in Touch",
    status: "published",
    created_at: 1696118400,
    updated_at: 1696118400,
    published_at: 1696118400,
    seo_json: {
      title: "Contact — Plain Jane Journal",
      description: "Direct inquiries, editorial commissions, and conversations.",
      og_image_asset_id: "asset-og-default",
    },
    og_image_asset_id: "asset-og-default",
    sections: [
      {
        id: "sec-contact-body",
        page_id: "page-journal-contact",
        definition_key: "journal-post-body",
        version: "1.0.0",
        template_sku: "tpl-journal-post-body-default",
        section_order: 1,
        section_data: { prose_width: "max-w-3xl" },
        status: "active",
        blocks: [
          {
            id: "blk-contact-head",
            section_id: "sec-contact-body",
            definition_key: "journal-heading-block",
            version: "1.0.0",
            template_sku: "tpl-journal-heading-block-default",
            block_order: 1,
            status: "active",
            content_json: { text: "Contact & Editorial Correspondence", level: 2 },
          },
          {
            id: "blk-contact-lead",
            section_id: "sec-contact-body",
            definition_key: "journal-lead-paragraph",
            version: "1.0.0",
            template_sku: "tpl-journal-lead-paragraph-default",
            block_order: 2,
            status: "active",
            content_json: { text: "For writing commissions, print acquisitions, or conversations about stillness, please reach out via the channels below." },
          },
          {
            id: "blk-contact-text",
            section_id: "sec-contact-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 3,
            status: "active",
            content_json: { text: "Direct email: hello@janedoe.com. I read every message and respond within a few days." },
          },
        ],
      },
    ],
  },

  // 7. 404 Page
  {
    id: "page-journal-404",
    site_id: "site-plain-jane",
    project_slug: cmsConfig.siteSlug,
    page_type: "404",
    slug: "404",
    title: "Page Not Found",
    status: "published",
    created_at: 1696118400,
    updated_at: 1696118400,
    published_at: 1696118400,
    seo_json: {
      title: "404 Not Found — Plain Jane Journal",
      description: "The page you requested could not be located.",
      og_image_asset_id: "asset-og-default",
    },
    og_image_asset_id: "asset-og-default",
    sections: [
      {
        id: "sec-404-body",
        page_id: "page-journal-404",
        definition_key: "journal-post-body",
        version: "1.0.0",
        template_sku: "tpl-journal-post-body-default",
        section_order: 1,
        section_data: { prose_width: "max-w-3xl" },
        status: "active",
        blocks: [
          {
            id: "blk-404-head",
            section_id: "sec-404-body",
            definition_key: "journal-heading-block",
            version: "1.0.0",
            template_sku: "tpl-journal-heading-block-default",
            block_order: 1,
            status: "active",
            content_json: { text: "404 — A Quiet Dead End", level: 2 },
          },
          {
            id: "blk-404-lead",
            section_id: "sec-404-body",
            definition_key: "journal-lead-paragraph",
            version: "1.0.0",
            template_sku: "tpl-journal-lead-paragraph-default",
            block_order: 2,
            status: "active",
            content_json: { text: "The page you are looking for has moved, was archived, or never existed in this quiet space." },
          },
          {
            id: "blk-404-text",
            section_id: "sec-404-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 3,
            status: "active",
            content_json: { text: "You can return to the journal home page or browse the photography archives." },
          },
        ],
      },
    ],
  },

  // 8. Privacy Policy Page
  {
    id: "page-journal-privacy",
    site_id: "site-plain-jane",
    project_slug: cmsConfig.siteSlug,
    page_type: "legal",
    slug: "privacy",
    title: "Privacy Policy",
    status: "published",
    created_at: 1696118400,
    updated_at: 1696118400,
    published_at: 1696118400,
    seo_json: {
      title: "Privacy Policy — Plain Jane Journal",
      description: "How we respect your attention and privacy on Plain Jane Journal.",
      og_image_asset_id: "asset-og-default",
    },
    og_image_asset_id: "asset-og-default",
    sections: [
      {
        id: "sec-privacy-body",
        page_id: "page-journal-privacy",
        definition_key: "journal-post-body",
        version: "1.0.0",
        template_sku: "tpl-journal-post-body-default",
        section_order: 1,
        section_data: { prose_width: "max-w-3xl" },
        status: "active",
        blocks: [
          {
            id: "blk-priv-head",
            section_id: "sec-privacy-body",
            definition_key: "journal-heading-block",
            version: "1.0.0",
            template_sku: "tpl-journal-heading-block-default",
            block_order: 1,
            status: "active",
            content_json: { text: "Privacy Policy", level: 2 },
          },
          {
            id: "blk-priv-lead",
            section_id: "sec-privacy-body",
            definition_key: "journal-lead-paragraph",
            version: "1.0.0",
            template_sku: "tpl-journal-lead-paragraph-default",
            block_order: 2,
            status: "active",
            content_json: { text: "This journal is built on the philosophy of quiet observation. We do not track your digital life across the web." },
          },
          {
            id: "blk-priv-text",
            section_id: "sec-privacy-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 3,
            status: "active",
            content_json: { text: "We do not sell personal data, inject third-party ad pixels, or run behavioral surveillance. If you write an email to the author, your address is solely used to reply." },
          },
        ],
      },
    ],
  },

  // 9. Terms of Service Page
  {
    id: "page-journal-terms",
    site_id: "site-plain-jane",
    project_slug: cmsConfig.siteSlug,
    page_type: "legal",
    slug: "terms",
    title: "Terms of Service",
    status: "published",
    created_at: 1696118400,
    updated_at: 1696118400,
    published_at: 1696118400,
    seo_json: {
      title: "Terms of Service — Plain Jane Journal",
      description: "Terms and conditions for remixing and reading Plain Jane Journal.",
      og_image_asset_id: "asset-og-default",
    },
    og_image_asset_id: "asset-og-default",
    sections: [
      {
        id: "sec-terms-body",
        page_id: "page-journal-terms",
        definition_key: "journal-post-body",
        version: "1.0.0",
        template_sku: "tpl-journal-post-body-default",
        section_order: 1,
        section_data: { prose_width: "max-w-3xl" },
        status: "active",
        blocks: [
          {
            id: "blk-terms-head",
            section_id: "sec-terms-body",
            definition_key: "journal-heading-block",
            version: "1.0.0",
            template_sku: "tpl-journal-heading-block-default",
            block_order: 1,
            status: "active",
            content_json: { text: "Terms of Service", level: 2 },
          },
          {
            id: "blk-terms-lead",
            section_id: "sec-terms-body",
            definition_key: "journal-lead-paragraph",
            version: "1.0.0",
            template_sku: "tpl-journal-lead-paragraph-default",
            block_order: 2,
            status: "active",
            content_json: { text: "This journal template is made to be remixed, published, and enjoyed as a clean foundation for personal expression." },
          },
          {
            id: "blk-terms-text",
            section_id: "sec-terms-body",
            definition_key: "journal-text-block",
            version: "1.0.0",
            template_sku: "tpl-journal-text-block-default",
            block_order: 3,
            status: "active",
            content_json: { text: "All original photography and essays are copyright Jane Doe. When using this template for your own CMS, replace sample media and copy with your original work." },
          },
        ],
      },
    ],
  },
];

// ----------------------------------------------------
// Read-Only Data Fetchers
// ----------------------------------------------------

/**
 * Fetch a Page by slug, with all Sections and Blocks populated.
 */
export async function fetchPageBySlug(slug: string): Promise<CMSPage | null> {
  const cleanSlug = slug === "" || slug === "/" ? "home" : slug.replace(/^\//, "");

  try {
    const res = await fetch(
      `${cmsConfig.apiBase}/pages/${encodeURIComponent(cleanSlug)}?site=${encodeURIComponent(cmsConfig.siteSlug)}`
    );
    if (res.ok) {
      const data = (await res.json()) as CMSPage;
      if (data && data.slug) return data;
    }
  } catch {
    // Non-fatal: fallback to fixture store
  }

  const page = fixturePages.find((p) => p.slug === cleanSlug);
  return page ? JSON.parse(JSON.stringify(page)) as CMSPage : null;
}

/**
 * Fetch all pages of a specific page_type
 */
export async function fetchPagesByType(pageType: CMSPageType): Promise<CMSPage[]> {
  try {
    const res = await fetch(
      `${cmsConfig.apiBase}/pages?type=${encodeURIComponent(pageType)}&site=${encodeURIComponent(cmsConfig.siteSlug)}`
    );
    if (res.ok) {
      const data = (await res.json()) as CMSPage[];
      if (Array.isArray(data)) return data;
    }
  } catch {
    // Non-fatal
  }

  const filtered = fixturePages.filter((p) => p.page_type === pageType);
  return JSON.parse(JSON.stringify(filtered)) as CMSPage[];
}

/**
 * Fetch all pages across the site
 */
export async function fetchAllPages(): Promise<CMSPage[]> {
  try {
    const res = await fetch(
      `${cmsConfig.apiBase}/pages?site=${encodeURIComponent(cmsConfig.siteSlug)}`
    );
    if (res.ok) {
      const data = (await res.json()) as CMSPage[];
      if (Array.isArray(data)) return data;
    }
  } catch {
    // Non-fatal
  }

  return JSON.parse(JSON.stringify(fixturePages)) as CMSPage[];
}

// ----------------------------------------------------
// Dynamic SEO & OpenGraph Management Hook
// ----------------------------------------------------

function setMetaTag(nameOrProperty: string, value: string, isProperty = false): void {
  if (typeof document === "undefined") return;
  const selector = isProperty
    ? `meta[property="${nameOrProperty}"]`
    : `meta[name="${nameOrProperty}"]`;
  let meta = document.querySelector(selector) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    if (isProperty) {
      meta.setAttribute("property", nameOrProperty);
    } else {
      meta.setAttribute("name", nameOrProperty);
    }
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", value);
}

import { useSEO } from "./useSEO";
export { useSEO };
export const usePageSEO = useSEO;


