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
    key: "__editor.spacing.paddingLeft",
    label: "Left padding",
    type: "range",
    group: "spacing",
    default: 0,
    min: 0,
    max: 160,
    step: 4,
    unit: "px",
  },
  {
    key: "__editor.spacing.paddingRight",
    label: "Right padding",
    type: "range",
    group: "spacing",
    default: 0,
    min: 0,
    max: 160,
    step: 4,
    unit: "px",
  },
  {
    key: "__editor.spacing.marginTop",
    label: "Top margin",
    type: "range",
    group: "spacing",
    default: 0,
    min: -160,
    max: 160,
    step: 4,
    unit: "px",
  },
  {
    key: "__editor.spacing.marginBottom",
    label: "Bottom margin",
    type: "range",
    group: "spacing",
    default: 0,
    min: -160,
    max: 160,
    step: 4,
    unit: "px",
  },
  {
    key: "__editor.spacing.marginLeft",
    label: "Left margin",
    type: "range",
    group: "spacing",
    default: 0,
    min: -160,
    max: 160,
    step: 4,
    unit: "px",
  },
  {
    key: "__editor.spacing.marginRight",
    label: "Right margin",
    type: "range",
    group: "spacing",
    default: 0,
    min: -160,
    max: 160,
    step: 4,
    unit: "px",
  },
  {
    key: "__editor.appearance.borderRadius",
    label: "Corner radius",
    type: "range",
    group: "appearance",
    default: 0,
    min: 0,
    max: 160,
    step: 2,
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
      header: {
        sortOrder: 0,
        label: "Header",
        icon: "header",
        capabilities: { reorder: false, duplicate: false, remove: false, blocks: true },
        fields: [
          { key: "logoUrl", label: "Logo", type: "media", group: "Brand" },
          { key: "logoHeight", label: "Logo height", type: "range", group: "Brand", min: 40, max: 120, step: 2, unit: "px", default: 58 },
          {
            key: "preset",
            label: "Header style",
            type: "select",
            group: "Layout",
            default: "adaptive-bar",
            options: [
              { label: "Adaptive bar", value: "adaptive-bar" },
              { label: "Frost pill", value: "frost-pill" },
            ],
          },
          { key: "announcementEnabled", label: "Show announcement", type: "boolean", group: "Announcement", default: false },
          { key: "announcementText", label: "Announcement text", type: "text", group: "Announcement" },
          { key: "announcementHref", label: "Announcement link", type: "link", group: "Announcement" },
        ],
        blocks: [
          {
            key: "nav-link",
            label: "Navigation link",
            repeatable: true,
            min: 1,
            max: 12,
            fields: [
              { key: "label", label: "Label", type: "text" },
              { key: "href", label: "Link", type: "link" },
              { key: "visible", label: "Visible", type: "boolean", default: true },
            ],
            defaultContent: {
              label: "New link",
              href: "/",
              visible: true,
            },
          },
        ],
        defaultContent: {
          logoUrl: M.logo,
          logoHeight: 58,
          preset: "adaptive-bar",
          announcementEnabled: false,
          announcementText: "",
          announcementHref: "",
          nav1: { label: "Home", href: "/", visible: true },
          nav2: { label: "Shop", href: "/shop", visible: true },
          nav3: { label: "About", href: "/about", visible: true },
          nav4: { label: "Community", href: "/community", visible: true },
          __editor: {
            blocks: [
              { id: "nav1", templateKey: "nav-link", enabled: true },
              { id: "nav2", templateKey: "nav-link", enabled: true },
              { id: "nav3", templateKey: "nav-link", enabled: true },
              { id: "nav4", templateKey: "nav-link", enabled: true },
            ],
          },
        },
      },
      brand: {
        sortOrder: 1,
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
        sortOrder: 2,
        label: "Global Footer",
        icon: "footer",
        fields: [
          { key: "logoUrl", label: "Footer logo", type: "media", group: "Brand" },
          { key: "tagline", label: "Tagline", type: "text", group: "Brand" },
          { key: "description", label: "Description", type: "textarea", group: "Brand" },
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
          logoUrl: M.logo,
          tagline: "Time is the real flex.",
          description: "For those who've earned their freedom through hard work, service, and dedication.",
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
          copyright: "Fuel & Free Time. All rights reserved.",
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
            "Fuel & Free Time isn't about how fast you go — it's about finally having the time to go at all.",
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
        settings: [
          { key: "__editor.layout.heroHeight", label: "Hero height", type: "select", group: "layout", default: "theme",
            options: [{value:"theme",label:"Theme default"},{value:"small",label:"Small"},{value:"medium",label:"Medium"},{value:"tall",label:"Tall"},{value:"screen",label:"Full screen"}] },
          { key: "__editor.layout.heroVertical", label: "Content position", type: "select", group: "layout", default: "theme",
            options: [{value:"theme",label:"Theme default"},{value:"top",label:"Top"},{value:"center",label:"Center"},{value:"bottom",label:"Bottom"}] },
          { key: "__editor.layout.heroAlignment", label: "Content alignment", type: "select", group: "layout", default: "theme",
            options: [{value:"theme",label:"Theme default"},{value:"left",label:"Left"},{value:"center",label:"Center"},{value:"right",label:"Right"}] },
          { key: "__editor.layout.heroImageFocus", label: "Image focal point", type: "select", group: "media", default: "theme",
            options: [{value:"theme",label:"Theme default"},{value:"left",label:"Left"},{value:"center",label:"Center"},{value:"right",label:"Right"}] },
          { key: "__editor.layout.heroOverlay", label: "Image overlay", type: "range", group: "media", default: 100, min: 0, max: 100, step: 5, unit: "%" },
        ],
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
          imageUrl: "/assets/presets/fuel-free-time/earned-hours-hero.webp",
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
              imageUrl: "/assets/presets/fuel-free-time/earned-hours-hero.webp",
              href: "/shop/collections",
            },
          },
        ],
        defaultContent: {
          title: "Collections",
          card1: { name: "High Octane Collection", imageUrl: "/assets/presets/fuel-free-time/earned-hours-hero.webp", href: "/shop/collections/high-octane-performance-gear" },
          card2: { name: "Masters Collection", imageUrl: "/assets/presets/fuel-free-time/masters.webp", href: "/shop/collections/masters" },
          card3: { name: "Everyday Essentials", imageUrl: "/assets/presets/fuel-free-time/essentials.webp", href: "/shop/collections/essentials" },
          __editor: {
            blocks: [
              { id: "card1", templateKey: "collection-card", enabled: true },
              { id: "card2", templateKey: "collection-card", enabled: true },
              { id: "card3", templateKey: "collection-card", enabled: true },
            ],
          },
        },
      },
      "editorial-grid": {
        sortOrder: 2,
        label: "Collections Editorial Grid",
        icon: "collections",
        fields: [],
        blocks: [
          {
            key: "editorial-tile",
            label: "Editorial tile",
            repeatable: true,
            min: 1,
            max: 9,
            fields: [
              { key: "eyebrow", label: "Eyebrow", type: "text" },
              { key: "headline", label: "Headline", type: "text" },
              { key: "imageUrl", label: "Photo", type: "media" },
              { key: "href", label: "Destination", type: "link" },
            ],
            defaultContent: {
              eyebrow: "Collection",
              headline: "A story worth telling",
              imageUrl: "/assets/presets/fuel-free-time/earned-hours-hero.webp",
              href: "/shop/collections",
            },
          },
        ],
        defaultContent: {
          tile1: { eyebrow: "High Octane", headline: "Run it past redline", imageUrl: "/assets/presets/fuel-free-time/earned-hours-hero.webp", href: "/shop/collections/high-octane-performance-gear" },
          tile2: { eyebrow: "The long way home", headline: "Wear the hours you earned", imageUrl: "/assets/presets/fuel-free-time/masters.webp", href: "#catalog" },
          tile3: { eyebrow: "Essentials", headline: "Clock out. Get gone.", imageUrl: "/assets/presets/fuel-free-time/essentials.webp", href: "/shop/collections/essentials" },
          __editor: {
            blocks: [
              { id: "tile1", templateKey: "editorial-tile", enabled: true },
              { id: "tile2", templateKey: "editorial-tile", enabled: true },
              { id: "tile3", templateKey: "editorial-tile", enabled: true },
            ],
          },
        },
      },
      "products-grid": {
        sortOrder: 3,
        label: "Products Grid",
        icon: "products",
        fields: [
          { key: "eyebrow", label: "Eyebrow", type: "text" },
          { key: "title", label: "Heading", type: "text" },
        ],
        // Products, availability, prices, variants, filtering and purchases
        // remain bound to the commerce API. No product rows in CMS settings.
        defaultContent: { eyebrow: "Available now", title: "Shop all gear" },
      },
      stories: {
        sortOrder: 4,
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
        sortOrder: 5,
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
    // Source-faithful Heuristic sections and field definitions.
    sections: {
      "hero": {
        "label": "Hero",
        "sortOrder": 0,
        "sourceSection": "fnf.about.hero",
        "fields": [
          {
            "key": "meta1",
            "label": "Meta1",
            "type": "text"
          },
          {
            "key": "meta2",
            "label": "Meta2",
            "type": "text"
          },
          {
            "key": "headline",
            "label": "Headline",
            "type": "text"
          },
          {
            "key": "subheadline",
            "label": "Subheadline",
            "type": "textarea"
          }
        ],
        "defaultContent": {
          "meta1": "Est. 2025",
          "meta2": "Made in Lafayette, Louisiana",
          "headline": "Built in the Garage",
          "subheadline": "Born around garage nights, hands-on projects, and one stubborn idea: the hours we earn should be ours to live. Apparel is part of the story; the machines, makers, and experiences are the rest."
        }
      },
      "moment": {
        "label": "Moment",
        "sortOrder": 1,
        "sourceSection": "fnf.about.moment",
        "fields": [
          {
            "key": "headline",
            "label": "Headline",
            "type": "text"
          },
          {
            "key": "lead",
            "label": "Lead",
            "type": "text"
          },
          {
            "key": "body",
            "label": "Body",
            "type": "textarea"
          },
          {
            "key": "quote",
            "label": "Quote",
            "type": "text"
          },
          {
            "key": "closing",
            "label": "Closing",
            "type": "textarea"
          }
        ],
        "defaultContent": {
          "headline": "The Moment Everything Changed",
          "lead": "3:47 AM. Highway 90. Just outside Lafayette.",
          "body": "After pulling a 16-hour shift, watching the sun rise over the Atchafalaya Basin from the seat of my bike, it hit me. I'd spent 20 years trading time for money, thinking someday I'd have enough to finally live. But watching those old-timers at the truck stop — guys who'd \"made it\" but were too broken or too late to enjoy it — I realized the real luxury wasn't in my bank account.",
          "quote": "\"Time isn't money. Time is everything money can't buy back.\"",
          "closing": "That morning, Fuel & Free Time was born. Not as a business plan, but as a middle finger to the lie that we should wait until retirement to live. Every piece we make is a reminder: the goal isn't to get rich enough to buy freedom. It's to be free enough to get rich in experiences."
        }
      },
      "video": {
        "label": "Video",
        "sortOrder": 2,
        "sourceSection": "fnf.about.video",
        "fields": [
          {
            "key": "videoUrl",
            "label": "Video Url",
            "type": "video"
          }
        ],
        "defaultContent": {
          "videoUrl": "/media/archive/shopify-import/videos/video-2-48add6d0.mp4"
        }
      },
      "collections": {
        "label": "Collections",
        "sortOrder": 3,
        "sourceSection": "fnf.about.collections",
        "fields": [
          {
            "key": "title",
            "label": "Title",
            "type": "text"
          }
        ],
        "blocks": [
          {
            "key": "collection-card",
            "label": "Collection Card",
            "max": 8,
            "fields": [
              {
                "key": "href",
                "label": "Href",
                "type": "link"
              },
              {
                "key": "badge",
                "label": "Badge",
                "type": "text"
              },
              {
                "key": "imageUrl",
                "label": "Image Url",
                "type": "media"
              },
              {
                "key": "title",
                "label": "Title",
                "type": "text"
              },
              {
                "key": "description",
                "label": "Description",
                "type": "text"
              },
              {
                "key": "ctaLabel",
                "label": "Cta Label",
                "type": "text"
              }
            ],
            "defaultContent": {
              "href": "/shop",
              "badge": "Core Collection",
              "imageUrl": "/media/archive/shopify-import/graphics/50C9CEB5.png",
              "title": "The Essentials",
              "description": "Daily drivers. The tees, hoodies, and gear that remind you why you grind — so you don't have to forever.",
              "ctaLabel": "Explore Core →"
            }
          }
        ],
        "defaultContent": {
          "title": "The Gear That Gets It",
          "card1": {
            "href": "/shop",
            "badge": "Core Collection",
            "imageUrl": "/media/archive/shopify-import/graphics/50C9CEB5.png",
            "title": "The Essentials",
            "description": "Daily drivers. The tees, hoodies, and gear that remind you why you grind — so you don't have to forever.",
            "ctaLabel": "Explore Core →"
          },
          "card2": {
            "href": "/shop",
            "badge": "High Octane",
            "imageUrl": "/media/archive/shopify-import/graphics/Vette.png",
            "title": "High Octane",
            "description": "Performance gear for when you're burning rubber, not burning out. Technical fabrics meet garage style.",
            "ctaLabel": "Shop Performance →"
          },
          "card3": {
            "href": "/shop",
            "badge": "Limited Drops",
            "imageUrl": "/media/archive/shopify-import/graphics/fuel_up.png",
            "title": "Masters Series",
            "description": "Small batch. Big stories. Limited pieces honoring those who've mastered the art of living on their terms.",
            "ctaLabel": "View Drops →"
          },
          "__editor": {
            "blocks": [
              {
                "id": "card1",
                "templateKey": "collection-card",
                "enabled": true
              },
              {
                "id": "card2",
                "templateKey": "collection-card",
                "enabled": true
              },
              {
                "id": "card3",
                "templateKey": "collection-card",
                "enabled": true
              }
            ]
          }
        }
      },
      "against": {
        "label": "Against",
        "sortOrder": 4,
        "sourceSection": "fnf.about.against",
        "fields": [
          {
            "key": "headline",
            "label": "Headline",
            "type": "text"
          }
        ],
        "blocks": [
          {
            "key": "belief-card",
            "label": "Belief Card",
            "max": 6,
            "fields": [
              {
                "key": "icon",
                "label": "Icon",
                "type": "text"
              },
              {
                "key": "title",
                "label": "Title",
                "type": "text"
              },
              {
                "key": "description",
                "label": "Description",
                "type": "text"
              }
            ],
            "defaultContent": {
              "icon": "💼",
              "title": "The 40-Year Plan",
              "description": "Waiting until 65 to start living. We believe life happens now, not after four decades of postponement."
            }
          }
        ],
        "defaultContent": {
          "headline": "What We Stand Against",
          "card1": {
            "icon": "💼",
            "title": "The 40-Year Plan",
            "description": "Waiting until 65 to start living. We believe life happens now, not after four decades of postponement."
          },
          "card2": {
            "icon": "⏰",
            "title": "Time Poverty",
            "description": "Being cash rich but time broke. What good is a garage full of toys if you never have time to play?"
          },
          "card3": {
            "icon": "🏢",
            "title": "Corporate Chains",
            "description": "Golden handcuffs and corner offices that become expensive prisons. Freedom isn't negotiable."
          },
          "__editor": {
            "blocks": [
              {
                "id": "card1",
                "templateKey": "belief-card",
                "enabled": true
              },
              {
                "id": "card2",
                "templateKey": "belief-card",
                "enabled": true
              },
              {
                "id": "card3",
                "templateKey": "belief-card",
                "enabled": true
              }
            ]
          }
        }
      },
      "lafayette": {
        "label": "Lafayette",
        "sortOrder": 5,
        "sourceSection": "fnf.about.lafayette",
        "fields": [
          {
            "key": "badge",
            "label": "Badge",
            "type": "text"
          },
          {
            "key": "headline",
            "label": "Headline",
            "type": "text"
          },
          {
            "key": "body",
            "label": "Body",
            "type": "textarea"
          }
        ],
        "defaultContent": {
          "badge": "🔥 Louisiana Made 🔥",
          "headline": "Crafted in Lafayette",
          "body": "Rooted in Lafayette, Louisiana. Our perspective comes from the garage, the road, and the work happening between them. We're building a brand around what we make, where we go, and who comes along."
        }
      },
      "origins": {
        "label": "Origins",
        "sortOrder": 6,
        "sourceSection": "fnf.about.origins",
        "fields": [
          {
            "key": "titleAccent",
            "label": "Title Accent",
            "type": "text"
          }
        ],
        "blocks": [
          {
            "key": "story-photo",
            "label": "Story Photo",
            "max": 12,
            "fields": [
              {
                "key": "body",
                "label": "Body",
                "type": "textarea"
              },
              {
                "key": "imageUrl",
                "label": "Image Url",
                "type": "media"
              }
            ],
            "defaultContent": {
              "body": "Fuel & Free Time isn't backed by investors or focus groups. It started with grease under the fingernails and a realization that hit harder than Louisiana summer heat.",
              "imageUrl": "/media/archive/shopify-import/graphics/50C9CEB5.png"
            }
          },
          {
            "key": "story-video",
            "label": "Story Video",
            "max": 12,
            "fields": [
              {
                "key": "body",
                "label": "Body",
                "type": "textarea"
              },
              {
                "key": "videoUrl",
                "label": "Video Url",
                "type": "video"
              }
            ],
            "defaultContent": {
              "body": "From apparel and artwork to repairs, rides, and the helicopter restoration, each project should say something about the hours we choose to spend. It's more than another product grid.",
              "videoUrl": "/media/archive/shopify-import/videos/video-1-f506d934.mp4"
            }
          }
        ],
        "defaultContent": {
          "titleAccent": "Full",
          "story1": {
            "body": "Fuel & Free Time isn't backed by investors or focus groups. It started with grease under the fingernails and a realization that hit harder than Louisiana summer heat.",
            "imageUrl": "/media/archive/shopify-import/graphics/50C9CEB5.png"
          },
          "story2": {
            "body": "From apparel and artwork to repairs, rides, and the helicopter restoration, each project should say something about the hours we choose to spend. It's more than another product grid.",
            "videoUrl": "/media/archive/shopify-import/videos/video-1-f506d934.mp4"
          },
          "story3": {
            "body": "From that first sunrise on Highway 90 to every late-night garage session since, we've stayed true to one principle: time is the only real currency.",
            "imageUrl": "/media/archive/shopify-import/graphics/high_octane.jpg"
          },
          "__editor": {
            "blocks": [
              {
                "id": "story1",
                "templateKey": "story-photo",
                "enabled": true
              },
              {
                "id": "story2",
                "templateKey": "story-video",
                "enabled": true
              },
              {
                "id": "story3",
                "templateKey": "story-photo",
                "enabled": true
              }
            ]
          }
        }
      },
      "lifestyle": {
        "label": "Lifestyle",
        "sortOrder": 7,
        "sourceSection": "fnf.about.lifestyle",
        "fields": [
          {
            "key": "headline",
            "label": "Headline",
            "type": "text"
          }
        ],
        "blocks": [
          {
            "key": "value-card",
            "label": "Value Card",
            "max": 8,
            "fields": [
              {
                "key": "title",
                "label": "Title",
                "type": "text"
              },
              {
                "key": "body",
                "label": "Body",
                "type": "text"
              }
            ],
            "defaultContent": {
              "title": "Time as Currency",
              "body": "The only resource you can't earn back. We measure wealth in free hours, not dollar signs."
            }
          }
        ],
        "defaultContent": {
          "headline": "What Drives Us",
          "card1": {
            "title": "Time as Currency",
            "body": "The only resource you can't earn back. We measure wealth in free hours, not dollar signs."
          },
          "card2": {
            "title": "Fuel Everything",
            "body": "Gas, diesel, jet fuel, coffee — whatever powers your passion, we celebrate it."
          },
          "card3": {
            "title": "Cross-Gen Unity",
            "body": "Old heads and young bucks united by shared values, not shared birthdays."
          },
          "card4": {
            "title": "Culture > Commerce",
            "body": "Building a movement, not just moving product. Community first, sales second."
          },
          "__editor": {
            "blocks": [
              {
                "id": "card1",
                "templateKey": "value-card",
                "enabled": true
              },
              {
                "id": "card2",
                "templateKey": "value-card",
                "enabled": true
              },
              {
                "id": "card3",
                "templateKey": "value-card",
                "enabled": true
              },
              {
                "id": "card4",
                "templateKey": "value-card",
                "enabled": true
              }
            ]
          }
        }
      },
      "cta": {
        "label": "Cta",
        "sortOrder": 8,
        "sourceSection": "fnf.about.cta",
        "fields": [
          {
            "key": "headline",
            "label": "Headline",
            "type": "text"
          },
          {
            "key": "body",
            "label": "Body",
            "type": "text"
          },
          {
            "key": "primary.href",
            "label": "Primary Href",
            "type": "link"
          },
          {
            "key": "primary.label",
            "label": "Primary Label",
            "type": "text"
          },
          {
            "key": "secondary.href",
            "label": "Secondary Href",
            "type": "link"
          },
          {
            "key": "secondary.label",
            "label": "Secondary Label",
            "type": "text"
          }
        ],
        "defaultContent": {
          "headline": "Ready to Claim Your Time?",
          "body": "Join a growing tribe that measures success in sunsets, not spreadsheets.",
          "primary": {
            "href": "/shop",
            "label": "Shop the Collection"
          },
          "secondary": {
            "href": "/community",
            "label": "Join the Movement"
          }
        }
      }
    }
  },
  community: {
    title: "Community",
    // Source-faithful Heuristic sections and field definitions.
    sections: {
      "hero": {
        "label": "Hero",
        "sortOrder": 0,
        "sourceSection": "fnf.community.hero",
        "fields": [
          {
            "key": "headline",
            "label": "Headline",
            "type": "text"
          },
          {
            "key": "headlineAccent",
            "label": "Headline Accent",
            "type": "text"
          },
          {
            "key": "subheadline",
            "label": "Subheadline",
            "type": "textarea"
          },
          {
            "key": "stat1Value",
            "label": "Stat1 Value",
            "type": "text"
          },
          {
            "key": "stat1Label",
            "label": "Stat1 Label",
            "type": "text"
          },
          {
            "key": "stat2Value",
            "label": "Stat2 Value",
            "type": "text"
          },
          {
            "key": "stat2Label",
            "label": "Stat2 Label",
            "type": "text"
          },
          {
            "key": "stat3Value",
            "label": "Stat3 Value",
            "type": "text"
          },
          {
            "key": "stat3Label",
            "label": "Stat3 Label",
            "type": "text"
          },
          {
            "key": "stat4Value",
            "label": "Stat4 Value",
            "type": "text"
          },
          {
            "key": "stat4Label",
            "label": "Stat4 Label",
            "type": "text"
          }
        ],
        "defaultContent": {
          "headline": "Join the",
          "headlineAccent": "Movement",
          "subheadline": "From the garage floor to the open road—and an aircraft restoration still taking shape—this is a place for the projects and people that make free time worth chasing.",
          "stat1Value": "BUILD",
          "stat1Label": "Hands-On",
          "stat2Value": "RIDE",
          "stat2Label": "Open Roads",
          "stat3Value": "FLY",
          "stat3Label": "Restoration",
          "stat4Value": "LIVE",
          "stat4Label": "The Hours"
        }
      },
      "events": {
        "label": "Events",
        "sortOrder": 1,
        "sourceSection": "fnf.community.events",
        "fields": [
          {
            "key": "heading",
            "label": "Heading",
            "type": "text"
          },
          {
            "key": "intro",
            "label": "Intro",
            "type": "textarea"
          }
        ],
        "blocks": [
          {
            "key": "event-card",
            "label": "Event Card",
            "max": 12,
            "fields": [
              {
                "key": "imageUrl",
                "label": "Image Url",
                "type": "media"
              },
              {
                "key": "badge",
                "label": "Badge",
                "type": "text"
              },
              {
                "key": "date",
                "label": "Date",
                "type": "text"
              },
              {
                "key": "title",
                "label": "Title",
                "type": "text"
              },
              {
                "key": "location",
                "label": "Location",
                "type": "text"
              },
              {
                "key": "description",
                "label": "Description",
                "type": "text"
              },
              {
                "key": "cta.href",
                "label": "Cta Href",
                "type": "link"
              },
              {
                "key": "cta.label",
                "label": "Cta Label",
                "type": "text"
              }
            ],
            "defaultContent": {
              "imageUrl": "/media/archive/shopify-import/graphics/Vette.png",
              "badge": "Concept",
              "date": "Date to be confirmed",
              "title": "Garage Night LA",
              "location": "📍 Downtown Los Angeles",
              "description": "Talk shop, trade build stories, and meet the people behind the projects.",
              "cta": {
                "href": "/collaborate",
                "label": "Help Plan It →"
              }
            }
          }
        ],
        "defaultContent": {
          "heading": "On the Drawing Board",
          "intro": "These are gathering ideas, not confirmed events. Help shape what we build next—dates and locations come after plans are real.",
          "event1": {
            "imageUrl": "/media/archive/shopify-import/graphics/Vette.png",
            "badge": "Concept",
            "date": "Date to be confirmed",
            "title": "Garage Night LA",
            "location": "📍 Downtown Los Angeles",
            "description": "Talk shop, trade build stories, and meet the people behind the projects.",
            "cta": {
              "href": "/collaborate",
              "label": "Help Plan It →"
            }
          },
          "event2": {
            "imageUrl": "/media/archive/shopify-import/graphics/high_octane.jpg",
            "badge": "Idea in Progress",
            "date": "Not yet scheduled",
            "title": "Miami Scavenger Hunt",
            "location": "📍 Miami, FL",
            "description": "A scavenger-hunt concept for a future gathering—no drop or event has been scheduled.",
            "cta": {
              "href": "/collaborate",
              "label": "Share An Idea →"
            }
          },
          "event3": {
            "imageUrl": "/media/archive/shopify-import/graphics/50C9CEB5.png",
            "badge": "Community Proposal",
            "date": "Schedule to be decided",
            "title": "Fuel Stop ATX",
            "location": "📍 Austin, TX",
            "description": "Coffee, machines and conversation. A meetup idea looking for a local host.",
            "cta": {
              "href": "/collaborate",
              "label": "Become A Host →"
            }
          },
          "event4": {
            "imageUrl": "/media/archive/shopify-import/graphics/fuel_up.png",
            "badge": "Long-Range Idea",
            "date": "Route still being imagined",
            "title": "Coast to Coast Run",
            "location": "📍 Nationwide",
            "description": "A coast-to-coast adventure worth dreaming about. The route is not yet planned.",
            "cta": {
              "href": "/collaborate",
              "label": "Talk Routes →"
            }
          },
          "__editor": {
            "blocks": [
              {
                "id": "event1",
                "templateKey": "event-card",
                "enabled": true
              },
              {
                "id": "event2",
                "templateKey": "event-card",
                "enabled": true
              },
              {
                "id": "event3",
                "templateKey": "event-card",
                "enabled": true
              },
              {
                "id": "event4",
                "templateKey": "event-card",
                "enabled": true
              }
            ]
          }
        }
      },
      "gallery": {
        "label": "Gallery",
        "sortOrder": 2,
        "sourceSection": "fnf.community.gallery",
        "fields": [
          {
            "key": "heading",
            "label": "Heading",
            "type": "text"
          }
        ],
        "blocks": [
          {
            "key": "gallery-item",
            "label": "Gallery Item",
            "max": 18,
            "fields": [
              {
                "key": "imageUrl",
                "label": "Image Url",
                "type": "media"
              },
              {
                "key": "caption",
                "label": "Caption",
                "type": "text"
              }
            ],
            "defaultContent": {
              "imageUrl": "/media/archive/shopify-import/graphics/50C9CEB5.png",
              "caption": "Hours outside the ordinary"
            }
          }
        ],
        "defaultContent": {
          "heading": "Living the Life",
          "item1": {
            "imageUrl": "/media/archive/shopify-import/graphics/50C9CEB5.png",
            "caption": "Hours outside the ordinary"
          },
          "item2": {
            "imageUrl": "/media/archive/shopify-import/graphics/Vette.png",
            "caption": "On the road, for the ride"
          },
          "item3": {
            "imageUrl": "/media/archive/shopify-import/graphics/high_octane.jpg",
            "caption": "High Octane · Garage inspiration"
          },
          "item4": {
            "imageUrl": "/media/archive/shopify-import/graphics/Masters.png",
            "caption": "Masters · In the making"
          },
          "item5": {
            "imageUrl": "/media/archive/shopify-import/graphics/fuel_up.png",
            "caption": "Fueled by the little things"
          },
          "item6": {
            "imageUrl": "/media/archive/shopify-import/graphics/Gone_Fishing.png",
            "caption": "The weekend is worth earning"
          },
          "__editor": {
            "blocks": [
              {
                "id": "item1",
                "templateKey": "gallery-item",
                "enabled": true
              },
              {
                "id": "item2",
                "templateKey": "gallery-item",
                "enabled": true
              },
              {
                "id": "item3",
                "templateKey": "gallery-item",
                "enabled": true
              },
              {
                "id": "item4",
                "templateKey": "gallery-item",
                "enabled": true
              },
              {
                "id": "item5",
                "templateKey": "gallery-item",
                "enabled": true
              },
              {
                "id": "item6",
                "templateKey": "gallery-item",
                "enabled": true
              }
            ]
          }
        }
      },
      "join": {
        "label": "Join",
        "sortOrder": 3,
        "sourceSection": "fnf.community.join",
        "fields": [
          {
            "key": "headline",
            "label": "Headline",
            "type": "text"
          },
          {
            "key": "body",
            "label": "Body",
            "type": "textarea"
          }
        ],
        "blocks": [
          {
            "key": "join-card",
            "label": "Join Card",
            "max": 6,
            "fields": [
              {
                "key": "icon",
                "label": "Icon",
                "type": "text"
              },
              {
                "key": "title",
                "label": "Title",
                "type": "text"
              },
              {
                "key": "description",
                "label": "Description",
                "type": "text"
              },
              {
                "key": "cta.href",
                "label": "Cta Href",
                "type": "link"
              },
              {
                "key": "cta.label",
                "label": "Cta Label",
                "type": "text"
              }
            ],
            "defaultContent": {
              "icon": "📱",
              "title": "Follow the Feed",
              "description": "Daily inspiration, event updates, and member spotlights. Stay connected to the culture.",
              "cta": {
                "href": "#member-stories",
                "label": "Follow Us"
              }
            }
          }
        ],
        "defaultContent": {
          "headline": "Get Connected",
          "body": "Choose your path. Whether you're here for the gear, the gatherings, or the grind, there's a place for you in the movement.",
          "card1": {
            "icon": "📱",
            "title": "Follow the Feed",
            "description": "Daily inspiration, event updates, and member spotlights. Stay connected to the culture.",
            "cta": {
              "href": "#member-stories",
              "label": "Follow Us"
            }
          },
          "card2": {
            "icon": "🎯",
            "title": "Join Exclusive Drops",
            "description": "Get early access to limited releases, scavenger hunt clues, and member-only gear.",
            "cta": {
              "href": "/shop",
              "label": "Get Access"
            }
          },
          "card3": {
            "icon": "🤝",
            "title": "Host an Event",
            "description": "Want to bring Fuel & Free Time to your city? Let's build the movement together.",
            "cta": {
              "href": "/collaborate",
              "label": "Collaborate"
            }
          },
          "__editor": {
            "blocks": [
              {
                "id": "card1",
                "templateKey": "join-card",
                "enabled": true
              },
              {
                "id": "card2",
                "templateKey": "join-card",
                "enabled": true
              },
              {
                "id": "card3",
                "templateKey": "join-card",
                "enabled": true
              }
            ]
          }
        }
      },
      "stories": {
        "label": "Stories",
        "sortOrder": 4,
        "sourceSection": "fnf.community.stories",
        "fields": [
          {
            "key": "heading",
            "label": "Heading",
            "type": "text"
          }
        ],
        "blocks": [
          {
            "key": "member-story",
            "label": "Member Story",
            "max": 12,
            "fields": [
              {
                "key": "quote",
                "label": "Quote",
                "type": "textarea"
              },
              {
                "key": "author",
                "label": "Author",
                "type": "text"
              },
              {
                "key": "role",
                "label": "Role",
                "type": "text"
              }
            ],
            "defaultContent": {
              "quote": "\"20 years in the service, now every sunrise ride reminds me what I was fighting for. Time is the only real freedom.\"",
              "author": "Marcus T.",
              "role": "Veteran Rider"
            }
          }
        ],
        "defaultContent": {
          "heading": "Voices Worth Hearing",
          "story1": {
            "quote": "\"20 years in the service, now every sunrise ride reminds me what I was fighting for. Time is the only real freedom.\"",
            "author": "Marcus T.",
            "role": "Veteran Rider"
          },
          "story2": {
            "quote": "\"Weekend warrior by necessity, but those Saturday morning garage sessions keep me sane. This community gets it.\"",
            "author": "Sarah K.",
            "role": "Weekend Warrior"
          },
          "story3": {
            "quote": "\"Just got my first bike at 22. The old heads here taught me it's not about going fast, it's about going far.\"",
            "author": "Jake R.",
            "role": "Young Gun"
          },
          "__editor": {
            "blocks": [
              {
                "id": "story1",
                "templateKey": "member-story",
                "enabled": true
              },
              {
                "id": "story2",
                "templateKey": "member-story",
                "enabled": true
              },
              {
                "id": "story3",
                "templateKey": "member-story",
                "enabled": true
              }
            ]
          }
        }
      },
      "social": {
        "label": "Social",
        "sortOrder": 5,
        "sourceSection": "fnf.community.social",
        "fields": [
          {
            "key": "heading",
            "label": "Heading",
            "type": "text"
          },
          {
            "key": "hashtag",
            "label": "Hashtag",
            "type": "text"
          },
          {
            "key": "cta.href",
            "label": "Cta Href",
            "type": "link"
          },
          {
            "key": "cta.label",
            "label": "Cta Label",
            "type": "text"
          }
        ],
        "defaultContent": {
          "heading": "Share Your Story",
          "hashtag": "#FuelAndFreeTime #TimeIsTheRealFlex",
          "cta": {
            "href": "/collaborate",
            "label": "Tag Us In Your Journey"
          }
        }
      }
    }
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
          headline: "Collaborate with Fuel & Free Time",
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
            "Thoughtful retail relationships for shops and spaces that understand the Fuel & Free Time customer.",
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
            "This page is the working policy baseline for the Fuel & Free Time storefront. Product-specific notices and checkout terms can add detail where needed.",
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
          headline: "Terms for using the Fuel & Free Time storefront",
          intro:
            "These terms provide a practical baseline for browsing the site and purchasing goods from Fuel & Free Time. Product, checkout, promotion, and fulfillment notices shown at the time of purchase also apply.",
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
            "Fuel & Free Time names, marks, artwork, photography, product designs, copy, and other original storefront materials remain protected by their applicable intellectual-property rights unless a different license is expressly stated.",
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

// Installation-owned CMS pages, drafts, and media must come from D1 or the
// explicitly selected theme package. Do not load the historical FNF Revise
// site/media fixtures into every customer's registry at Worker startup.
// The fixture sources remain preserved under fixtures/ for explicit review.

export const PAGE_SLUGS = Object.keys(PAGE_REGISTRY);

export function getRegistryPage(slug) {
  const def = PAGE_REGISTRY[slug];
  if (!def) return null;
  const sections = Object.entries(def.sections)
    .map(([key, sec]) => ({
      key,
      sort_order: sec.sortOrder,
      status: def.defaultStatus || "published",
      content: structuredClone(sec.defaultContent),
      updated_at: null,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    slug,
    title: def.title,
    status: def.defaultStatus || "published",
    sections,
    source: "registry",
  };
}

export function listRegistryPages() {
  return PAGE_SLUGS.filter((s) => s !== "site").map((slug) => ({
    slug,
    title: PAGE_REGISTRY[slug].title,
    status: PAGE_REGISTRY[slug].defaultStatus || "published",
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
