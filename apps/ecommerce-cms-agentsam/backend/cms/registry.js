/**
 * CMS section registry — source of truth for page/section schemas and seed defaults.
 * Used for: D1 seeding, admin field schemas, merge defaults on edit (not public fallback).
 */
import { M } from "./media-paths.js";

/**
 * GUI field types supported by the CMS editor. Existing registry entries can keep
 * legacy "url" declarations; registryForAdmin() normalizes them to link/media/video.
 *
 * @typedef {'text'|'rich_text'|'textarea'|'boolean'|'select'|'range'|'number'|'color'|'link'|'media'|'video'|'product'|'collection'|'variant'|'url'} CmsFieldType
 * @typedef {{
 *   key: string,
 *   label: string,
 *   type: CmsFieldType,
 *   media?: boolean,
 *   help?: string,
 *   group?: string,
 *   default?: unknown,
 *   options?: Array<{label:string,value:string}>,
 *   min?: number,
 *   max?: number,
 *   step?: number,
 *   unit?: string,
 *   placeholder?: string,
 *   productKey?: string
 * }} FieldDef
 *
 * @typedef {{
 *   sortOrder: number,
 *   label?: string,
 *   icon?: string,
 *   capabilities?: Record<string, boolean>,
 *   fields: FieldDef[],
 *   blocks?: Array<object>,
 *   settings?: FieldDef[],
 *   motion?: object,
 *   responsive?: object,
 *   guardrails?: object,
 *   defaultContent: object
 * }} SectionDef
 *
 * @type {Record<string, { title: string, sections: Record<string, SectionDef> }>}
 */
export const CMS_FIELD_TYPES = Object.freeze([
  "text",
  "rich_text",
  "textarea",
  "boolean",
  "select",
  "range",
  "number",
  "color",
  "link",
  "media",
  "video",
  "product",
  "collection",
  "variant",
]);

const COMMON_SECTION_SETTINGS = Object.freeze([
  {
    key: "__editor.layout.width",
    label: "Width",
    type: "select",
    group: "layout",
    default: "inherit",
    options: [
      { label: "Theme default", value: "inherit" },
      { label: "Contained", value: "contained" },
      { label: "Wide", value: "wide" },
      { label: "Full bleed", value: "full-bleed" },
    ],
  },
  {
    key: "__editor.layout.alignment",
    label: "Alignment",
    type: "select",
    group: "layout",
    default: "inherit",
    options: [
      { label: "Theme default", value: "inherit" },
      { label: "Left", value: "left" },
      { label: "Center", value: "center" },
      { label: "Right", value: "right" },
    ],
  },
  {
    key: "__editor.spacing.paddingTop",
    label: "Top padding",
    type: "range",
    group: "spacing",
    default: 0,
    min: 0,
    max: 160,
    step: 4,
    unit: "px",
  },
  {
    key: "__editor.spacing.paddingBottom",
    label: "Bottom padding",
    type: "range",
    group: "spacing",
    default: 0,
    min: 0,
    max: 160,
    step: 4,
    unit: "px",
  },
  {
    key: "__editor.appearance.backgroundEnabled",
    label: "Background",
    type: "boolean",
    group: "appearance",
    default: false,
  },
  {
    key: "__editor.appearance.backgroundColor",
    label: "Background color",
    type: "color",
    group: "appearance",
    default: "#ffffff",
  },
  {
    key: "__editor.motion.preset",
    label: "Motion preset",
    type: "select",
    group: "motion",
    default: "inherit",
    options: [
      { label: "Theme default", value: "inherit" },
      { label: "None", value: "none" },
      { label: "Fade", value: "fade" },
      { label: "Parallax", value: "parallax" },
      { label: "Blur + recede", value: "blur-recede" },
      { label: "Horizontal scrub", value: "horizontal-scrub" },
      { label: "Sticky", value: "sticky" },
      { label: "Marquee", value: "marquee" },
    ],
  },
  {
    key: "__editor.motion.intensity",
    label: "Motion intensity",
    type: "range",
    group: "motion",
    default: 0.25,
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: "__editor.responsive.hideMobile",
    label: "Hide on mobile",
    type: "boolean",
    group: "responsive",
    default: false,
  },
  {
    key: "__editor.visibility.enabled",
    label: "Visible",
    type: "boolean",
    group: "visibility",
    default: true,
  },
]);

function inferredGuiType(field) {
  if (CMS_FIELD_TYPES.includes(field.type)) return field.type;
  const haystack = `${field.key || ""} ${field.label || ""}`.toLowerCase();
  if (field.media) return /video/.test(haystack) ? "video" : "media";
  if (field.type === "url") return /image|video|media|logo|glb|gltf|model/.test(haystack) ? (/video/.test(haystack) ? "video" : "media") : "link";
  return field.type || "text";
}

export function normalizeCmsField(field) {
  const type = inferredGuiType(field);
  return {
    ...field,
    type,
    media: type === "media" || type === "video",
  };
}

function defaultSectionMetadata(key, sec) {
  return {
    label: sec.label || key.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
    icon: sec.icon || "section",
    capabilities: {
      edit: true,
      media: true,
      settings: true,
      reorder: true,
      duplicate: true,
      remove: true,
      blocks: Array.isArray(sec.blocks) && sec.blocks.length > 0,
      ...(sec.capabilities || {}),
    },
    blocks: structuredClone(sec.blocks || []),
    settings: [...COMMON_SECTION_SETTINGS, ...(sec.settings || [])].map(normalizeCmsField),
    motion: structuredClone(sec.motion || {
      presets: ["inherit", "none", "fade", "parallax", "blur-recede", "horizontal-scrub", "sticky", "marquee"],
      default: "inherit",
    }),
    responsive: structuredClone(sec.responsive || {
      desktop: true,
      tablet: true,
      mobile: true,
    }),
    guardrails: structuredClone(sec.guardrails || {
      maxBlocks: 24,
      destructiveRequiresConfirmation: true,
      allowRawCss: false,
      allowRawHtml: false,
    }),
  };
}

export const PAGE_REGISTRY = {
  site: {
    title: "Site (global)",
    sections: {
      brand: {
        sortOrder: 0,
        fields: [
          { key: "logoUrl", label: "Logo URL", type: "media" },
          { key: "tagline", label: "Tagline", type: "text" },
          { key: "footerDescription", label: "Footer description", type: "textarea" },
        ],
        defaultContent: {
          logoUrl: M.logo,
          tagline: "Time is the real flex.",
          footerDescription:
            "For those who've earned their freedom through hard work, service, and dedication. This is more than apparel — it's a badge of the life you've built.",
        },
      },
      footer: {
        sortOrder: 1,
        label: "Global Footer",
        icon: "footer",
        fields: [
          { key: "exploreTitle", label: "Explore heading", type: "text", group: "Explore" },
          { key: "exploreShopLabel", label: "Shop label", type: "text", group: "Explore" },
          { key: "exploreShopHref", label: "Shop link", type: "link", group: "Explore" },
          { key: "exploreCommunityLabel", label: "Community label", type: "text", group: "Explore" },
          { key: "exploreCommunityHref", label: "Community link", type: "link", group: "Explore" },
          { key: "exploreCollaborateLabel", label: "Collaborate label", type: "text", group: "Explore" },
          { key: "exploreCollaborateHref", label: "Collaborate link", type: "link", group: "Explore" },

          { key: "supportTitle", label: "Support heading", type: "text", group: "Support" },
          { key: "supportContactLabel", label: "Contact label", type: "text", group: "Support" },
          { key: "supportContactHref", label: "Contact link", type: "link", group: "Support" },
          { key: "supportPoliciesLabel", label: "Policies label", type: "text", group: "Support" },
          { key: "supportPoliciesHref", label: "Policies link", type: "link", group: "Support" },
          { key: "supportTermsLabel", label: "Terms label", type: "text", group: "Support" },
          { key: "supportTermsHref", label: "Terms link", type: "link", group: "Support" },
          { key: "supportDashboardLabel", label: "Dashboard label", type: "text", group: "Support" },
          { key: "supportDashboardHref", label: "Dashboard link", type: "link", group: "Support" },

          { key: "connectTitle", label: "Connect heading", type: "text", group: "Connect" },
          { key: "instagramUrl", label: "Instagram URL", type: "link", group: "Connect" },
          { key: "facebookUrl", label: "Facebook URL", type: "link", group: "Connect" },
          { key: "youtubeUrl", label: "YouTube URL", type: "link", group: "Connect" },

          { key: "newsletterTitle", label: "Newsletter heading", type: "text", group: "Newsletter" },
          { key: "newsletterPlaceholder", label: "Email placeholder", type: "text", group: "Newsletter" },
          { key: "newsletterButtonLabel", label: "Button label", type: "text", group: "Newsletter" },

          { key: "copyright", label: "Copyright text", type: "text", group: "Footer bottom" },
          { key: "closingLine", label: "Closing line", type: "text", group: "Footer bottom" },
        ],
        defaultContent: {
          exploreTitle: "Explore",
          exploreShopLabel: "Shop",
          exploreShopHref: "/shop",
          exploreCommunityLabel: "Community",
          exploreCommunityHref: "/community",
          exploreCollaborateLabel: "Collaborate",
          exploreCollaborateHref: "/collaborate",
          supportTitle: "Support",
          supportContactLabel: "Contact",
          supportContactHref: "/collaborate",
          supportPoliciesLabel: "Policies",
          supportPoliciesHref: "/policies",
          supportTermsLabel: "Terms",
          supportTermsHref: "/terms",
          supportDashboardLabel: "Dashboard",
          supportDashboardHref: "/admin/",
          connectTitle: "Stay Connected",
          instagramUrl: "",
          facebookUrl: "",
          youtubeUrl: "",
          newsletterTitle: "Get Updates",
          newsletterPlaceholder: "Your email",
          newsletterButtonLabel: "Join",
          copyright: "Ember Supply. All rights reserved.",
          closingLine: "Built for those who've earned it.",
        },
      },
    },
  },
  home: {
    title: "Home",
    sections: {
      hero: {
        sortOrder: 0,
        fields: [
          { key: "titleLine1", label: "Title line 1", type: "text" },
          { key: "titleLine2", label: "Title line 2 (emphasis)", type: "text" },
          { key: "subheadline", label: "Subheadline", type: "textarea" },
          { key: "ctaLabel", label: "CTA label", type: "text" },
          { key: "ctaHref", label: "CTA link", type: "text" },
          { key: "glbUrl", label: "3D model URL", type: "url", media: true },
        ],
        defaultContent: {
          titleLine1: "TIME IS THE",
          titleLine2: "REAL HORSEPOWER",
          subheadline:
            "For those who've earned their freedom — on two wheels, four wheels, water, or in the garage.",
          ctaLabel: "Explore More",
          ctaHref: "/shop",
          glbUrl: M.glbEmblem,
        },
      },
      manifesto: {
        sortOrder: 1,
        fields: [
          { key: "line1", label: "Title line 1", type: "text" },
          { key: "highlight1", label: "Highlight word 1", type: "text" },
          { key: "line2", label: "Title line 2", type: "text" },
          { key: "highlight2", label: "Highlight word 2", type: "text" },
          { key: "body1", label: "Paragraph 1", type: "textarea" },
          { key: "body2", label: "Paragraph 2", type: "textarea" },
          { key: "body3", label: "Paragraph 3 (emphasis)", type: "textarea" },
          { key: "imageUrl", label: "Side image", type: "url", media: true },
        ],
        defaultContent: {
          line1: "Some chase",
          highlight1: "horsepower.",
          line2: "We chase",
          highlight2: "hours.",
          body1:
            "Ember Supply isn't about how fast you go — it's about finally having the time to go at all.",
          body2:
            "Born in a Lafayette garage, built for those who've earned their freedom. Whether you're a veteran who's done your time, a weekend warrior stealing moments, or a young gun working toward that first real ride.",
          body3: "You get it. Time is everything money can't buy back.",
          imageUrl: M.coreCollection,
        },
      },
      collections: {
        sortOrder: 2,
        fields: [
          { key: "badge", label: "Badge", type: "text" },
          { key: "title", label: "Section title", type: "text" },
          { key: "card1.name", label: "Card 1 name", type: "text" },
          { key: "card1.description", label: "Card 1 description", type: "text" },
          { key: "card1.imageUrl", label: "Card 1 image", type: "url", media: true },
          { key: "card1.href", label: "Card 1 link", type: "text" },
          { key: "card2.name", label: "Card 2 name", type: "text" },
          { key: "card2.description", label: "Card 2 description", type: "text" },
          { key: "card2.imageUrl", label: "Card 2 image", type: "url", media: true },
          { key: "card2.href", label: "Card 2 link", type: "text" },
          { key: "card3.name", label: "Card 3 name", type: "text" },
          { key: "card3.description", label: "Card 3 description", type: "text" },
          { key: "card3.imageUrl", label: "Card 3 image", type: "url", media: true },
          { key: "card3.href", label: "Card 3 link", type: "text" },
        ],
        defaultContent: {
          badge: "Limited Drops",
          title: "Fuel Your Style",
          card1: {
            name: "High Octane",
            description: "Performance gear for redline living",
            imageUrl: M.highOctane,
            href: "/shop/collections/high-octane-performance-gear",
          },
          card2: {
            name: "Masters",
            description: "For those who've earned their stripes",
            imageUrl: M.masters,
            href: "/shop/collections/masters",
          },
          card3: {
            name: "Essentials",
            description: "Daily drivers for the daily grind",
            imageUrl: M.goneFishing,
            href: "/shop/collections/essentials",
          },
        },
      },
      values: {
        sortOrder: 3,
        fields: [
          { key: "title", label: "Section title", type: "text" },
          { key: "v1.title", label: "Value 1 title", type: "text" },
          { key: "v1.description", label: "Value 1 description", type: "textarea" },
          { key: "v2.title", label: "Value 2 title", type: "text" },
          { key: "v2.description", label: "Value 2 description", type: "textarea" },
          { key: "v3.title", label: "Value 3 title", type: "text" },
          { key: "v3.description", label: "Value 3 description", type: "textarea" },
        ],
        defaultContent: {
          title: "More Than Merch",
          v1: {
            title: "Earned Not Given",
            description:
              "Every thread tells a story of hard work and dedication. This isn't fast fashion — it's a lifestyle earned through years of grinding.",
          },
          v2: {
            title: "Built in Lafayette",
            description:
              "Proudly designed, cut, and sewn in Louisiana. Supporting local means building something real in a world of dropshipped dreams.",
          },
          v3: {
            title: "Community First",
            description:
              "From garage nights to poker runs, we're building connections that matter. Real people, real stories, real freedom.",
          },
        },
      },
      community: {
        sortOrder: 4,
        fields: [
          { key: "title", label: "Title", type: "text" },
          { key: "subtitle", label: "Subtitle", type: "textarea" },
          { key: "f1.title", label: "Feature 1 title", type: "text" },
          { key: "f1.text", label: "Feature 1 text", type: "text" },
          { key: "f2.title", label: "Feature 2 title", type: "text" },
          { key: "f2.text", label: "Feature 2 text", type: "text" },
          { key: "f3.title", label: "Feature 3 title", type: "text" },
          { key: "f3.text", label: "Feature 3 text", type: "text" },
          { key: "f4.title", label: "Feature 4 title", type: "text" },
          { key: "f4.text", label: "Feature 4 text", type: "text" },
        ],
        defaultContent: {
          title: "Join the Movement",
          subtitle: "Where every mile has a story and every hour is earned",
          f1: { title: "Hunt Drops", text: "Exclusive scavenger hunts for limited gear" },
          f2: { title: "Garage Nights", text: "Monthly meetups in Lafayette and beyond" },
          f3: { title: "Fuel Stops", text: "Pop-ups where stories meet the road" },
          f4: { title: "Early Access", text: "First dibs on every limited release" },
        },
      },
      newsletter: {
        sortOrder: 6,
        fields: [
          { key: "title", label: "Title", type: "text" },
          { key: "text", label: "Description", type: "textarea" },
          { key: "buttonLabel", label: "Button label", type: "text" },
        ],
        defaultContent: {
          title: "Stay Fueled Up",
          text: "Get first access to drops, event invites, and the stories that matter.",
          buttonLabel: "Join",
        },
      },
    },
  },
  shop: {
    title: "Shop",
    sections: {
      hero: {
        sortOrder: 0,
        fields: [
          { key: "eyebrow", label: "Eyebrow", type: "text" },
          { key: "headline", label: "Headline", type: "text" },
          { key: "subheadline", label: "Subheadline", type: "textarea" },
          { key: "imageUrl", label: "Hero image", type: "media" },
          { key: "ctaPrimary.label", label: "Primary CTA label", type: "text" },
          { key: "ctaPrimary.href", label: "Primary CTA link", type: "link" },
          { key: "ctaSecondary.label", label: "Secondary CTA label", type: "text" },
          { key: "ctaSecondary.href", label: "Secondary CTA link", type: "link" },
        ],
        defaultContent: {
          eyebrow: "Collections",
          headline: "A lifestyle built from grit — and time.",
          subheadline:
            "Shop High Octane, Masters, and Essentials. Clean grid. Real stories. Fire-orange attitude.",
          imageUrl: "/assets/presets/ember/earned-hours-hero.webp",
          ctaPrimary: { label: "Shop the Drop", href: "#catalog" },
          ctaSecondary: { label: "Browse Collections", href: "/shop/collections" },
        },
      },
      collections: {
        sortOrder: 1,
        settings: [
          {
            key: "__editor.layout.columns",
            label: "Columns",
            type: "range",
            group: "layout",
            default: 3,
            min: 1,
            max: 6,
            step: 1,
          },
          {
            key: "__editor.responsive.carouselMobile",
            label: "Carousel on mobile",
            type: "boolean",
            group: "responsive",
            default: true,
            help: "Use horizontal snap scrolling on narrow screens.",
          },
        ],
        fields: [
          { key: "title", label: "Section title", type: "text" },
        ],
        blocks: [
          {
            key: "collection-card",
            label: "Collection card",
            repeatable: true,
            min: 1,
            max: 12,
            fields: [
              { key: "name", label: "Name", type: "text" },
              { key: "imageUrl", label: "Image", type: "media" },
              { key: "href", label: "Link", type: "link" },
            ],
            defaultContent: {
              name: "New collection",
              imageUrl: "/assets/presets/ember/earned-hours-hero.webp",
              href: "/shop/collections",
            },
          },
        ],
        defaultContent: {
          title: "Collections",
          card1: { name: "High Octane Collection", imageUrl: "/assets/presets/ember/earned-hours-hero.webp", href: "/shop/collections/high-octane-performance-gear" },
          card2: { name: "Masters Collection", imageUrl: "/assets/presets/ember/masters.webp", href: "/shop/collections/masters" },
          card3: { name: "Everyday Essentials", imageUrl: "/assets/presets/ember/essentials.webp", href: "/shop/collections/essentials" },
          __editor: {
            blocks: [
              { id: "card1", templateKey: "collection-card", enabled: true },
              { id: "card2", templateKey: "collection-card", enabled: true },
              { id: "card3", templateKey: "collection-card", enabled: true },
            ],
          },
        },
      },
      stories: {
        sortOrder: 2,
        fields: [
          { key: "title", label: "Title", type: "text" },
          { key: "body", label: "Body", type: "textarea" },
          { key: "imageUrl", label: "Image", type: "url", media: true },
        ],
        defaultContent: {
          title: "Built for the long haul",
          body: "Every piece is designed for people who've earned their hours — not given them.",
          imageUrl: M.fuelUp,
        },
      },
      newsletter: {
        sortOrder: 3,
        fields: [
          { key: "title", label: "Title", type: "text" },
          { key: "buttonLabel", label: "Button label", type: "text" },
        ],
        defaultContent: {
          title: "Stay fueled. Don't miss drops, meetups, or giveaways.",
          buttonLabel: "Join the Movement",
        },
      },
    },
  },
  about: {
    title: "About",
    sections: {
      hero: {
        sortOrder: 0,
        fields: [
          { key: "meta1", label: "Meta line 1", type: "text" },
          { key: "meta2", label: "Meta line 2", type: "text" },
          { key: "headline", label: "Headline", type: "text" },
          { key: "subheadline", label: "Subheadline", type: "textarea" },
        ],
        defaultContent: {
          meta1: "Est. 2025",
          meta2: "Made in Lafayette, Louisiana",
          headline: "Built in the Garage",
          subheadline:
            "Born from blood, sweat, and years of earning our freedom. This is more than a brand — it's a brotherhood.",
        },
      },
      moment: {
        sortOrder: 1,
        fields: [
          { key: "headline", label: "Headline", type: "text" },
          { key: "body", label: "Body", type: "textarea" },
          { key: "videoUrl", label: "Video URL", type: "url", media: true },
        ],
        defaultContent: {
          headline: "The Moment That Started It All",
          body: "Late nights in the garage. Engines cooling. Stories flowing. That's where Ember Supply was born.",
          videoUrl: M.videoAbout1,
        },
      },
      collections: {
        sortOrder: 2,
        fields: [
          { key: "title", label: "Section title", type: "text" },
          { key: "card1.title", label: "Card 1 title", type: "text" },
          { key: "card1.imageUrl", label: "Card 1 image", type: "url", media: true },
          { key: "card2.title", label: "Card 2 title", type: "text" },
          { key: "card2.imageUrl", label: "Card 2 image", type: "url", media: true },
          { key: "card3.title", label: "Card 3 title", type: "text" },
          { key: "card3.imageUrl", label: "Card 3 image", type: "url", media: true },
        ],
        defaultContent: {
          title: "Three Collections. One Brotherhood.",
          card1: { title: "Ember Supply Core Collection", imageUrl: M.coreCollection },
          card2: { title: "High Octane Performance Collection", imageUrl: M.vette },
          card3: { title: "Masters Series Limited Edition", imageUrl: M.fuelUp },
        },
      },
      origins: {
        sortOrder: 3,
        fields: [
          { key: "headline", label: "Headline", type: "text" },
          { key: "body", label: "Body", type: "textarea" },
          { key: "imageUrl", label: "Image", type: "url", media: true },
          { key: "videoUrl", label: "Video URL", type: "url", media: true },
        ],
        defaultContent: {
          headline: "Ember Supply Origins",
          body: "From Lafayette garages to open roads — every design starts with a story worth wearing.",
          imageUrl: M.coreCollection,
          videoUrl: M.videoAbout2,
        },
      },
      lifestyle: {
        sortOrder: 4,
        fields: [
          { key: "headline", label: "Headline", type: "text" },
          { key: "imageUrl", label: "Image", type: "url", media: true },
        ],
        defaultContent: {
          headline: "High Octane Lifestyle",
          imageUrl: M.highOctane,
        },
      },
    },
  },
  community: {
    title: "Community",
    sections: {
      hero: {
        sortOrder: 0,
        fields: [
          { key: "headline", label: "Headline (before accent)", type: "text" },
          { key: "headlineAccent", label: "Headline accent", type: "text" },
          { key: "subheadline", label: "Subheadline", type: "textarea" },
          { key: "stat1Value", label: "Stat 1 value", type: "text" },
          { key: "stat1Label", label: "Stat 1 label", type: "text" },
          { key: "stat2Value", label: "Stat 2 value", type: "text" },
          { key: "stat2Label", label: "Stat 2 label", type: "text" },
          { key: "stat3Value", label: "Stat 3 value", type: "text" },
          { key: "stat3Label", label: "Stat 3 label", type: "text" },
          { key: "stat4Value", label: "Stat 4 value", type: "text" },
          { key: "stat4Label", label: "Stat 4 label", type: "text" },
        ],
        defaultContent: {
          headline: "Join the",
          headlineAccent: "Movement",
          subheadline:
            "Where every mile has a story, every hour is earned, and every member is family. This is more than a brand — it's a brotherhood of freedom seekers.",
          stat1Value: "5K+",
          stat1Label: "Members Strong",
          stat2Value: "23",
          stat2Label: "Cities Connected",
          stat3Value: "150+",
          stat3Label: "Events Hosted",
          stat4Value: "∞",
          stat4Label: "Stories Shared",
        },
      },
      join: {
        sortOrder: 1,
        fields: [
          { key: "headline", label: "Headline", type: "text" },
          { key: "body", label: "Body", type: "textarea" },
          { key: "ctaLabel", label: "CTA label", type: "text" },
          { key: "ctaHref", label: "CTA link", type: "text" },
        ],
        defaultContent: {
          headline: "Ready to Ride With Us?",
          body: "Join the movement. Get early access to drops, event invites, and the stories that matter.",
          ctaLabel: "Join the Movement",
          ctaHref: "#newsletter",
        },
      },
    },
  },
  collaborate: {
    title: "Collaborate",
    sections: {
      hero: {
        sortOrder: 0,
        fields: [
          { key: "eyebrow", label: "Eyebrow", type: "text" },
          { key: "headline", label: "Headline", type: "text" },
          { key: "intro", label: "Introduction", type: "textarea" },
        ],
        defaultContent: {
          eyebrow: "Build something worth remembering",
          headline: "Collaborate with Ember Supply",
          intro:
            "Partnerships should feel earned, useful, and real. We are open to aligned brands, makers, events, creators, retailers, and community projects that respect the hours people put in.",
        },
      },
      pathways: {
        sortOrder: 1,
        fields: [
          { key: "heading", label: "Section heading", type: "text" },
          { key: "brandTitle", label: "Brand partnerships title", type: "text" },
          { key: "brandBody", label: "Brand partnerships copy", type: "textarea" },
          { key: "eventsTitle", label: "Events title", type: "text" },
          { key: "eventsBody", label: "Events copy", type: "textarea" },
          { key: "retailTitle", label: "Retail title", type: "text" },
          { key: "retailBody", label: "Retail copy", type: "textarea" },
          { key: "creatorTitle", label: "Creators title", type: "text" },
          { key: "creatorBody", label: "Creators copy", type: "textarea" },
        ],
        defaultContent: {
          heading: "Ways to work together",
          brandTitle: "Brand & Product",
          brandBody:
            "Capsules, co-branded goods, product storytelling, and projects where both sides bring something meaningful to the table.",
          eventsTitle: "Events & Community",
          eventsBody:
            "Garage nights, rides, launches, pop-ups, fundraisers, and experiences built around people instead of impressions.",
          retailTitle: "Retail & Wholesale",
          retailBody:
            "Thoughtful retail relationships for shops and spaces that understand the Ember Supply customer.",
          creatorTitle: "Creators & Stories",
          creatorBody:
            "Photography, film, editorial, machines, craft, travel, and earned-time stories that fit the world we are building.",
        },
      },
      approach: {
        sortOrder: 2,
        fields: [
          { key: "heading", label: "Heading", type: "text" },
          { key: "body", label: "Body", type: "textarea" },
          { key: "ctaLabel", label: "CTA label", type: "text" },
          { key: "ctaHref", label: "CTA link", type: "link" },
        ],
        defaultContent: {
          heading: "Bring a clear idea — or just the right fit.",
          body:
            "If there is a natural reason for us to build together, start with the idea, audience, timing, and what a good outcome looks like. We would rather do fewer strong projects than force a partnership that does not fit.",
          ctaLabel: "Explore the community",
          ctaHref: "/community",
        },
      },
    },
  },
  policies: {
    title: "Policies",
    sections: {
      hero: {
        sortOrder: 0,
        fields: [
          { key: "eyebrow", label: "Eyebrow", type: "text" },
          { key: "headline", label: "Headline", type: "text" },
          { key: "intro", label: "Introduction", type: "textarea" },
        ],
        defaultContent: {
          eyebrow: "Store policies",
          headline: "Straightforward by design",
          intro:
            "This page is the working policy baseline for the Ember Supply storefront. Product-specific notices and checkout terms can add detail where needed.",
        },
      },
      policy: {
        sortOrder: 1,
        fields: [
          { key: "shippingTitle", label: "Shipping heading", type: "text" },
          { key: "shippingBody", label: "Shipping policy", type: "textarea" },
          { key: "returnsTitle", label: "Returns heading", type: "text" },
          { key: "returnsBody", label: "Returns policy", type: "textarea" },
          { key: "privacyTitle", label: "Privacy heading", type: "text" },
          { key: "privacyBody", label: "Privacy policy", type: "textarea" },
          { key: "accessibilityTitle", label: "Accessibility heading", type: "text" },
          { key: "accessibilityBody", label: "Accessibility policy", type: "textarea" },
          { key: "contactTitle", label: "Contact heading", type: "text" },
          { key: "contactBody", label: "Contact copy", type: "textarea" },
        ],
        defaultContent: {
          shippingTitle: "Shipping & Fulfillment",
          shippingBody:
            "Orders are prepared according to the availability and fulfillment information shown on the product page and at checkout. Tracking information is provided when available. Carrier delays, weather, address issues, and other events outside our control can affect delivery timing.",
          returnsTitle: "Returns & Exchanges",
          returnsBody:
            "If an item arrives damaged, incorrect, or materially different from what you ordered, contact us promptly with the order details. Eligibility for discretionary returns or exchanges can depend on the product type, condition, fulfillment partner, and any product-specific terms shown at purchase.",
          privacyTitle: "Privacy",
          privacyBody:
            "We use information you provide to operate the store, fulfill orders, provide support, prevent fraud, understand site performance, and communicate when you ask us to. Payment information is handled through our payment providers rather than stored as raw card data by this storefront.",
          accessibilityTitle: "Accessibility",
          accessibilityBody:
            "We want the storefront to be usable across devices and assistive technologies. If you encounter a barrier, let us know through the collaboration/contact page so we can review and improve it.",
          contactTitle: "Questions",
          contactBody:
            "For an order, policy, accessibility, collaboration, or storefront question, use the Collaborate / Contact page and include enough context for us to route it correctly.",
        },
      },
    },
  },
  terms: {
    title: "Terms",
    sections: {
      hero: {
        sortOrder: 0,
        fields: [
          { key: "eyebrow", label: "Eyebrow", type: "text" },
          { key: "headline", label: "Headline", type: "text" },
          { key: "intro", label: "Introduction", type: "textarea" },
        ],
        defaultContent: {
          eyebrow: "Store terms",
          headline: "Terms for using the Ember Supply storefront",
          intro:
            "These terms provide a practical baseline for browsing the site and purchasing goods from Ember Supply. Product, checkout, promotion, and fulfillment notices shown at the time of purchase also apply.",
        },
      },
      terms: {
        sortOrder: 1,
        fields: [
          { key: "ordersTitle", label: "Orders heading", type: "text" },
          { key: "ordersBody", label: "Orders terms", type: "textarea" },
          { key: "pricingTitle", label: "Pricing heading", type: "text" },
          { key: "pricingBody", label: "Pricing terms", type: "textarea" },
          { key: "useTitle", label: "Site use heading", type: "text" },
          { key: "useBody", label: "Site use terms", type: "textarea" },
          { key: "ipTitle", label: "IP heading", type: "text" },
          { key: "ipBody", label: "IP terms", type: "textarea" },
          { key: "availabilityTitle", label: "Availability heading", type: "text" },
          { key: "availabilityBody", label: "Availability terms", type: "textarea" },
          { key: "changesTitle", label: "Changes heading", type: "text" },
          { key: "changesBody", label: "Changes terms", type: "textarea" },
        ],
        defaultContent: {
          ordersTitle: "Orders & Acceptance",
          ordersBody:
            "Submitting an order is an offer to purchase the listed items. An order may be declined or canceled when an item is unavailable, payment cannot be verified, an order appears fraudulent, pricing is materially incorrect, or fulfillment cannot reasonably be completed.",
          pricingTitle: "Pricing, Promotions & Payment",
          pricingBody:
            "Prices and promotions can change before an order is submitted. Taxes, shipping, discounts, and other applicable charges are shown through the checkout flow. Payment is processed by the payment provider presented at checkout.",
          useTitle: "Acceptable Use",
          useBody:
            "Do not misuse the site, attempt unauthorized access, interfere with store operations, scrape protected account information, submit fraudulent orders, or use the storefront in a way that violates applicable law or the rights of others.",
          ipTitle: "Brand & Content",
          ipBody:
            "Ember Supply names, marks, artwork, photography, product designs, copy, and other original storefront materials remain protected by their applicable intellectual-property rights unless a different license is expressly stated.",
          availabilityTitle: "Availability & Service",
          availabilityBody:
            "Inventory, product details, site features, and third-party services can change. We work to keep storefront information accurate, but temporary outages, fulfillment changes, supplier updates, and technical errors can occur.",
          changesTitle: "Updates to These Terms",
          changesBody:
            "We may revise these terms as the storefront, products, or operating requirements change. The version displayed on this page is the current storefront version, and material purchase-specific terms are the ones presented when an order is placed.",
        },
      },
    },
  },
};

export const PAGE_SLUGS = Object.keys(PAGE_REGISTRY);

export function getRegistryPage(slug) {
  const def = PAGE_REGISTRY[slug];
  if (!def) return null;
  const sections = Object.entries(def.sections)
    .map(([key, sec]) => ({
      key,
      sort_order: sec.sortOrder,
      status: "published",
      content: structuredClone(sec.defaultContent),
      updated_at: null,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    slug,
    title: def.title,
    status: "published",
    sections,
    source: "registry",
  };
}

export function listRegistryPages() {
  return PAGE_SLUGS.filter((s) => s !== "site").map((slug) => ({
    slug,
    title: PAGE_REGISTRY[slug].title,
    status: "published",
    section_count: Object.keys(PAGE_REGISTRY[slug].sections).length,
    updated_at: null,
    source: "registry",
  }));
}

export function mergeWithRegistry(slug, sections) {
  const def = PAGE_REGISTRY[slug];
  if (!def) return sections.filter((section) => section.status !== "removed");

  const byKey = Object.fromEntries(sections.map((section) => [section.key, section]));
  const knownKeys = new Set(Object.keys(def.sections));
  const merged = Object.entries(def.sections)
    .sort(([, a], [, b]) => a.sortOrder - b.sortOrder)
    .map(([key, sec]) => {
      const existing = byKey[key];
      if (existing?.status === "removed") return null;
      if (!existing) {
        return {
          key,
          sort_order: sec.sortOrder,
          status: "draft",
          content: structuredClone(sec.defaultContent),
          source: "registry",
        };
      }
      return {
        ...existing,
        content: deepMerge(structuredClone(sec.defaultContent), existing.content || {}),
      };
    })
    .filter(Boolean);

  const dynamic = sections
    .filter((section) => !knownKeys.has(section.key) && section.status !== "removed")
    .map((section) => ({ ...section, source: section.source || "r2" }));

  return [...merged, ...dynamic].sort(
    (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
  );
}

function deepMerge(base, over) {
  if (!over || typeof over !== "object") return base;
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object") {
      deepMerge(base[k], v);
    } else if (v !== undefined && v !== null && v !== "") {
      base[k] = v;
    }
  }
  return base;
}

export function registryForAdmin() {
  const pages = {};
  for (const [slug, def] of Object.entries(PAGE_REGISTRY)) {
    pages[slug] = {
      title: def.title,
      sections: Object.fromEntries(
        Object.entries(def.sections).map(([key, sec]) => {
          const meta = defaultSectionMetadata(key, sec);
          return [
            key,
            {
              sortOrder: sec.sortOrder,
              label: meta.label,
              icon: meta.icon,
              capabilities: meta.capabilities,
              fields: sec.fields.map(normalizeCmsField),
              blocks: meta.blocks,
              settings: meta.settings,
              motion: meta.motion,
              responsive: meta.responsive,
              guardrails: meta.guardrails,
            },
          ];
        })
      ),
    };
  }
  return {
    ok: true,
    fieldTypes: CMS_FIELD_TYPES,
    pages,
    pageSlugs: PAGE_SLUGS,
    storefrontSlugs: PAGE_SLUGS.filter((s) => s !== "site"),
  };
}
