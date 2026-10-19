import { reviseShowcaseHome } from "@inneranimalmedia/revise-theme/showcase";

const FNF = "https://fuelnfreetime.com";

export const fnfReviseMedia = {
  "fnf.hero": `${FNF}/assets/presets/fuel-free-time/earned-hours-hero.webp`,
  "fnf.masters": `${FNF}/assets/presets/fuel-free-time/masters.webp`,
  "fnf.essentials": `${FNF}/assets/presets/fuel-free-time/essentials.webp`,
  "fnf.graphic.core": `${FNF}/media/archive/shopify-import/graphics/50C9CEB5.png`,
  "fnf.graphic.vette": `${FNF}/media/archive/shopify-import/graphics/Vette.png`,
  "fnf.graphic.fuel-up": `${FNF}/media/archive/shopify-import/graphics/fuel_up.png`,
  "fnf.high-octane": `${FNF}/media/archive/shopify-import/graphics/high_octane.jpg`,
  "fnf.tee.front": `${FNF}/media/products/shirts/fft-tee-frontside.webp`,
  "fnf.tee.back": `${FNF}/media/products/shirts/earn-your-freetime-teeshirt-backside.webp`,
  "fnf.hat": `${FNF}/media/products/fuel-n-freetime-hat/fuel-n-freetime-hat.webp`,
  "fnf.adventure-tee": `${FNF}/media/archive/shopify-import/photos/IMG_1509.jpg`,
  "fnf.build.dirt.1": `${FNF}/media/uploads/staging/images/preview/img-9439.webp`,
  "fnf.build.dirt.2": `${FNF}/media/uploads/staging/images/preview/img-9440.webp`,
  "fnf.build.dirt.3": `${FNF}/media/uploads/staging/images/preview/img-9441.webp`,
  "fnf.build.dirt.4": `${FNF}/media/uploads/staging/images/preview/img-9442.webp`,
  "fnf.build.dirt.5": `${FNF}/media/uploads/staging/images/preview/img-9443.webp`,
  "fnf.build.heli.1": `${FNF}/media/uploads/staging/images/preview/img-8533.webp`,
  "fnf.build.heli.2": `${FNF}/media/uploads/staging/images/preview/img-8568.webp`,
  "fnf.build.heli.3": `${FNF}/media/uploads/staging/images/preview/img-9191.webp`,
  "fnf.build.heli.4": `${FNF}/media/uploads/staging/images/preview/img-9194.webp`,
  "fnf.film.garage": `${FNF}/media/archive/shopify-import/videos/video-2-48add6d0.mp4`,
  "fnf.film.story": `${FNF}/media/archive/shopify-import/videos/video-1-f506d934.mp4`,
  "completeful.heavyweight-tee": "https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/product-47d3afff-3e4c-492a-8e8b-2dcfca38caa1/covers/f5efc1e0-4964-4e62-91be-96cdcf1f932f-clothing-mockups15.png",
  "completeful.glass-coffee-can": "https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/product-ab6f79dd-51de-4c33-9148-9cfec81e3870/covers/b6e9432f-a08a-4092-83bb-97ccd92bf461-glass-can-w-bamboo-lid-center.jpg",
  "completeful.bamboo-sunglasses": "https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/product-af7b535b-bed4-4c1f-9db3-b09676091842/covers/3bad2a79-f988-48ec-be78-d1e45fbb6d44-sunglasses-ai-center.jpg",
  "completeful.luggage-tag": "https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/product-0687f9d6-b826-47e3-adbf-84c331f365d6/covers/7b11e02b-a694-4028-aea4-1b0df43fa621-luggage-tag-ai-center.jpg",
  "completeful.stainless-tumbler": "https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/product-0dc6cade-4e94-4d30-89c7-c489e136ce1d/covers/6f067017-f442-42fd-b1ac-c9e65407923b-16oz-tumblers-white-center.png"
};

export const fnfReviseShell = {
  brand: "Fuel & Free Time",
  announcement: [
    "Concept preview · Earned Hours",
    "Built in Lafayette",
    "Existing assets + proposed product/campaign directions",
  ],
  footerBrand: "Fuel & Free Time / Earned Hours concept preview.",
  footerNote: "Existing F&FT content + live products + sourced product ideas + campaign concepts",
};

function stableSectionId(section, index) {
  const source = section.preset || section.variant || section.type || `section-${index + 1}`;
  const slug = String(source).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `s${String(index + 1).padStart(2, "0")}-${slug}`;
}

export function buildFnfReviseDraft() {
  const page = structuredClone(reviseShowcaseHome);
  page.id = "fnf-earned-hours-concept";
  page.theme = "revise";

  const byPreset = (preset) => page.sections.find((section) => section.preset === preset);
  const assign = (preset, data) => {
    const section = byPreset(preset);
    if (section) Object.assign(section.data, data);
  };

  assign("revise/sticky-curtain", {
    eyebrow: "The Earned Hours Collection",
    heading: "Time is the real horsepower.",
    body: "Hard-wearing essentials for garage nights, early launches, long roads, and every hour you fought to make your own.",
    mediaKey: "fnf.hero",
    mediaAlt: "Fuel & Free Time lifestyle in the garage at sunset",
    primaryAction: { label: "Preview the drop", href: "#fnf-products" },
    secondaryAction: { label: "See campaign directions", href: "#fnf-campaigns" },
  });

  assign("revise/wardrobe-rail", {
    eyebrow: "Existing brand worlds",
    heading: "The F&FT visual vocabulary is already here.",
    items: [
      { title: "Earned Hours", label: "Earned Hours", mediaKey: "fnf.hero", href: "#fnf-campaigns" },
      { title: "High Octane", label: "High Octane", mediaKey: "fnf.high-octane", href: "#fnf-campaigns" },
      { title: "Masters", label: "Masters", mediaKey: "fnf.masters", href: "#fnf-campaigns" },
      { title: "Essentials", label: "Essentials", mediaKey: "fnf.essentials", href: "#fnf-products" },
      { title: "Project Stories", label: "Project Stories", mediaKey: "fnf.build.heli.2", href: "#fnf-stories" },
    ],
  });

  assign("revise/dark-promo-grid", {
    anchor: "fnf-campaigns",
    eyebrow: "Campaign directions / existing source material",
    heading: "Three customer-facing worlds we can scaffold from what already exists.",
    items: [
      { label: "Concept 01 · Performance", title: "High Octane", body: "Garage nights, motion, machines, redline energy, and performance-minded product drops.", mediaKey: "fnf.high-octane", href: "#fnf-high-octane" },
      { label: "Concept 02 · Refined", title: "Masters", body: "Quiet confidence, black-on-black styling, premium staples, and products that feel earned rather than loud.", mediaKey: "fnf.masters", href: "#fnf-masters" },
      { label: "Concept 03 · Editorial", title: "Project Stories", body: "Turn real builds, machines, collaborators, and works-in-progress into campaign/editorial content instead of leaving them buried in the media library.", mediaKey: "fnf.build.heli.2", href: "#fnf-stories" },
    ],
  });

  assign("revise/editorial-statement", {
    eyebrow: "Brand thesis / existing copy",
    heading: "Some chase horsepower. We chase hours.",
    body: "Fuel & Free Time isn't about how fast you go — it's about finally having the time to go at all. Born in a Lafayette garage, built for those who've earned their freedom. Time is everything money can't buy back.",
  });

  assign("revise/story-rings", {
    items: [
      { title: "Garage Nights", mediaKey: "fnf.hero" },
      { title: "High Octane", mediaKey: "fnf.high-octane" },
      { title: "Masters", mediaKey: "fnf.masters" },
      { title: "Weekend Build", mediaKey: "fnf.build.dirt.1" },
      { title: "Project Story", mediaKey: "fnf.build.heli.2" },
      { title: "Free Time", mediaKey: "fnf.essentials" },
    ],
  });

  assign("revise/tabbed-products", {
    anchor: "fnf-products",
    eyebrow: "Product direction",
    heading: "Live pieces, existing graphics, and sourced next-product ideas.",
    tabs: [
      { id: "live", label: "Live / existing", items: [
        { title: "Fuel N Free Time Tee", price: "$34", mediaKey: "fnf.tee.front", badge: "Live" },
        { title: "Fresh Till Death Hat", price: "$34.99", mediaKey: "fnf.hat", badge: "Live" },
        { title: "Fuel + Adventure Tee", price: "Existing", mediaKey: "fnf.adventure-tee", badge: "Live asset" },
        { title: "Earn Your Free Time Back Print", price: "Existing", mediaKey: "fnf.tee.back", badge: "Existing art" },
      ]},
      { id: "next", label: "Next product ideas", items: [
        { title: "Heavyweight Garment-Dyed Tee", price: "Demo $32", mediaKey: "completeful.heavyweight-tee", badge: "Catalog" },
        { title: "16oz Glass Coffee Can", price: "Demo $24", mediaKey: "completeful.glass-coffee-can", badge: "Catalog" },
        { title: "16oz Stainless Tumbler", price: "Demo $28", mediaKey: "completeful.stainless-tumbler", badge: "Catalog" },
        { title: "Bamboo Frame Sunglasses", price: "Demo $24", mediaKey: "completeful.bamboo-sunglasses", badge: "Catalog" },
      ]},
      { id: "graphics", label: "Artwork directions", items: [
        { title: "Redline Sedan", price: "Graphic direction", mediaKey: "fnf.graphic.core" },
        { title: "Drive · Explore · Relax", price: "Graphic direction", mediaKey: "fnf.graphic.vette" },
        { title: "Work Hard · Play Harder", price: "Brand mark", mediaKey: "fnf.graphic.fuel-up" },
      ]},
    ],
  });

  assign("revise/scroll-text-reveal", {
    eyebrow: "Brand world / Lafayette",
    heading: "Built in the garage. Earned on the road.",
    body: "The strongest F&FT direction is the contrast between work and release: machines, late nights and hard-earned progress on one side; open roads, water, travel and actual free time on the other.",
    mediaKey: "fnf.hero",
    mediaAlt: "Garage opening onto a sunset landscape",
    product: { title: "Fuel N Free Time Tee", price: "$34", mediaKey: "fnf.tee.front" },
  });

  assign("revise/parallax-diptych", {
    items: [
      { title: "Fuel", body: "Garage nights, builds, machines, effort, detail, and the work that makes the free hours possible.", mediaKey: "fnf.masters", href: "#fnf-stories" },
      { title: "Free Time", body: "Open water, long roads, quiet mornings, travel, and the time you actually fought to own.", mediaKey: "fnf.essentials", href: "#fnf-stories" },
    ],
  });

  assign("revise/hotspot-lookbook", {
    heading: "The Earned Hours kit",
    mediaKey: "fnf.hero",
    mediaAlt: "Fuel & Free Time garage lifestyle",
    hotspots: [
      { x: 61, y: 49, title: "Fuel N Free Time Tee", price: "$34" },
      { x: 73, y: 30, title: "Fresh Till Death Hat", price: "$34.99" },
      { x: 82, y: 69, title: "16oz Stainless Tumbler", price: "Demo $28" },
    ],
  });

  assign("revise/pinned-pdp", {
    eyebrow: "Live product / existing store",
    heading: "Fuel N Free Time Tee",
    body: "Earned-not-given energy on premium cotton. Front graphic with full back print. Built for those who fuel hard and live free.",
    price: "$34",
    media: [
      { key: "fnf.tee.front", alt: "Fuel N Free Time Tee front" },
      { key: "fnf.tee.back", alt: "Fuel N Free Time Tee back" },
      { key: "fnf.adventure-tee", alt: "Fuel & Free Time apparel lifestyle" },
    ],
    actions: [{ label: "Preview product direction", href: "#fnf-products" }],
  });

  assign("revise/merch-lab", {
    anchor: "fnf-merch-lab",
    currency: "USD",
    eyebrow: "Sourced product ideas / current Completeful mirror",
    heading: "Use the catalog to extend the brand — not just fill a grid.",
    body: "These are current catalog families we can turn into F&FT products, add-ons, gifts, and campaign bundles. Retail and bundle prices remain concept pricing until artwork, shipping, and final margin validation are complete.",
    sourceNote: "Current F&FT catalog ideas. Proposed pricing is illustrative until product creation and validation.",
    showEconomics: true,
    products: [
      { id: "heavyweight-tee", title: "Heavyweight Garment-Dyed Tee", sourceLabel: "DTG · Comfort Colors 1717", role: "Core product", body: "Hero SKU for graphic drops and bundles.", mediaKey: "completeful.heavyweight-tee", proposedRetailCents: 3200, fulfillmentCostCents: 1100 },
      { id: "glass-coffee-can", title: "16oz Glass Coffee Can", sourceLabel: "UV · Clear", role: "Lifestyle upsell", body: "Distinctive drinkware add-on beside apparel.", mediaKey: "completeful.glass-coffee-can", proposedRetailCents: 2400, fulfillmentCostCents: 700 },
      { id: "luggage-tag", title: "Aluminum Luggage Tag", sourceLabel: "Etching · Black", role: "Low-friction upsell", body: "Small personalized travel add-on.", mediaKey: "completeful.luggage-tag", proposedRetailCents: 1600, fulfillmentCostCents: 400 },
    ],
    offers: [
      { id: "launch-kit", badge: "Starter bundle", title: "Launch Kit", body: "One hero apparel item plus two lifestyle add-ons.", productIds: ["heavyweight-tee", "glass-coffee-can", "luggage-tag"], compareAtCents: 7200, offerPriceCents: 5800, fulfillmentCostCents: 2200, ctaLabel: "Add launch kit" },
    ],
  });

  assign("revise/sticky-summary", {
    eyebrow: "Bundle concept / existing + sourced",
    heading: "The Earned Hours Starter Kit",
    body: "A concrete first upsell test: one live F&FT product, one existing accessory, and one easy sourced drinkware add-on.",
    total: "Concept $74",
    items: [
      { title: "Fuel N Free Time Tee", price: "$34", mediaKey: "fnf.tee.front", badge: "Live" },
      { title: "Fresh Till Death Hat", price: "$34.99", mediaKey: "fnf.hat", badge: "Live" },
      { title: "Glass Coffee Can", price: "Demo $24", mediaKey: "completeful.glass-coffee-can", badge: "Catalog idea" },
    ],
  });

  assign("revise/commerce-marquee", { items: ["Time is the real horsepower", "Earned not given", "Built in Lafayette", "Work hard. Play harder.", "Every mile has a story"] });

  assign("revise/pinned-media-grid", {
    eyebrow: "Collection concept / existing brand direction",
    heading: "High Octane",
    body: "Performance-minded gear for garage nights, open roads, and redline living.",
    mediaKey: "fnf.high-octane",
    mediaAlt: "Fuel & Free Time High Octane action imagery",
    items: [
      { title: "Heavyweight Tee", price: "Demo $32", mediaKey: "completeful.heavyweight-tee", badge: "Catalog" },
      { title: "Bamboo Sunglasses", price: "Demo $24", mediaKey: "completeful.bamboo-sunglasses", badge: "Catalog" },
      { title: "Stainless Tumbler", price: "Demo $28", mediaKey: "completeful.stainless-tumbler", badge: "Catalog" },
      { title: "Luggage Tag", price: "Demo $16", mediaKey: "completeful.luggage-tag", badge: "Catalog" },
    ],
  });

  assign("revise/brand-film", { eyebrow: "Existing F&FT footage / film treatment", heading: "The gear is part of the story. The time is the point.", mediaKey: "fnf.film.garage", posterKey: "fnf.hero", mediaAlt: "Fuel & Free Time brand film" });
  assign("revise/campaign-teaser", { anchor: "fnf-stories", eyebrow: "Campaign concept / real project imagery", heading: "Project Stories", body: "The media library already contains complete build sequences. Instead of treating them as loose uploads, we can scaffold them as editorial stories, collaborator profiles, launch teasers, and limited product capsules.", mediaKey: "fnf.build.heli.2", mediaAlt: "Helicopter buildout project", action: { label: "Build the story template", href: "#fnf-stories" } });
  assign("revise/logo-track", { items: ["FUEL & FREE TIME", "EARNED HOURS", "HIGH OCTANE", "MASTERS", "ESSENTIALS", "LAFAYETTE", "PROJECT STORIES"] });
  assign("revise/before-after", { eyebrow: "Brand tension", heading: "Fuel on one side. Free time on the other.", beforeKey: "fnf.masters", afterKey: "fnf.essentials", beforeAlt: "Garage and automotive lifestyle", afterAlt: "Lakeside free-time lifestyle" });
  assign("revise/testimonials", { eyebrow: "Existing brand language", heading: "The phrases worth building around.", items: [
    { quote: "Time isn't money. Time is everything money can't buy back.", by: "About / brand story" },
    { quote: "Every mile has a story. Every hour is earned.", by: "Community" },
    { quote: "Real people, real stories, real freedom.", by: "Home / community value" },
  ]});
  assign("revise/sticky-card-deck", { eyebrow: "Editorial pipeline / real media", heading: "Turn uploads into stories, not storage.", items: [
    { title: "Garage Build Notes", meta: "Concept · existing dirt-bike album", body: "A photo-sequence format for build stages, parts, lessons, and the people doing the work.", mediaKey: "fnf.build.dirt.1" },
    { title: "Project Story: Helicopter Buildout", meta: "Concept · existing helicopter album", body: "A longer-form collaboration story with progress photography, collaborator credits, and optional product capsule.", mediaKey: "fnf.build.heli.2" },
    { title: "Made in Lafayette", meta: "Existing brand story", body: "Origin, garage culture, regional identity, and the philosophy behind earning your hours.", mediaKey: "fnf.graphic.fuel-up" },
  ]});
  assign("revise/newsletter", { eyebrow: "Existing brand CTA", heading: "Stay fueled up", body: "Get first access to drops, event invites, and the stories that matter.", action: { label: "Join the list", href: "#" } });
  assign("revise/full-bleed-grid", { eyebrow: "Existing asset library", heading: "Enough material to start publishing now.", items: [
    { title: "Earned Hours", mediaKey: "fnf.hero" },
    { title: "High Octane", mediaKey: "fnf.high-octane" },
    { title: "F&FT Tee", mediaKey: "fnf.tee.back" },
    { title: "Weekend Build", mediaKey: "fnf.build.dirt.4" },
    { title: "Project Story", mediaKey: "fnf.build.heli.4" },
    { title: "Masters", mediaKey: "fnf.masters" },
  ]});
  assign("revise/faq", { eyebrow: "What this preview means", heading: "Existing, sourced, and concept are kept separate.", items: [
    { q: "What is already real today?", a: "The F&FT brand copy and collection directions, the Fuel N Free Time Tee, Fresh Till Death hat, Fuel + Adventure tee imagery, archived graphics/video, and the project/gallery media shown here already exist in the current buildout." },
    { q: "What is sourced but not yet a live F&FT product?", a: "The highlighted drinkware, sunglasses, luggage tag, heavyweight tee, and other add-ons come from the current available catalog mirror. They still need product creation, artwork, final pricing, shipping validation, and publish steps." },
    { q: "What is a campaign concept?", a: "Earned Hours, High Octane, Masters, and Project Stories are being arranged here as customer-facing campaign directions using existing F&FT source material. The purpose is to approve the vibe before we scaffold campaign/product records around it." },
  ]});
  assign("revise/trust-row", { items: [
    { title: "Existing assets", body: "Real F&FT media and copy." },
    { title: "Live products", body: "Current store pieces stay identifiable." },
    { title: "Sourced ideas", body: "Catalog concepts are labeled." },
    { title: "Ready to scaffold", body: "Approved concepts can become products + campaigns." },
  ]});

  page.sections = page.sections.map((section, index) => ({
    ...section,
    id: section.id || stableSectionId(section, index),
  }));

  return page;
}
