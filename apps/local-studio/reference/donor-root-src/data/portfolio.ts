export const categories = ["All", "Platform", "Brand", "Product", "Nonprofit"] as const;

export type CategoryFilter = (typeof categories)[number];
export type ProjectCategory = Exclude<CategoryFilter, "All">;

export type Project = {
  slug: string;
  title: string;
  category: ProjectCategory;
  year: string;
  role: string;
  description: string;
  image: string;
  href?: string;
  featured?: boolean;
};

export const projects: Project[] = [
  {
    slug: "meauxcloud",
    title: "MeauxCloud",
    category: "Platform",
    year: "2026",
    role: "SaaS · Workers · D1",
    description:
      "Enterprise operations hub — projects, analytics, and infrastructure on the edge. Cloudflare Workers, D1, live telemetry.",
    image: "/projects/northline.jpg",
    href: "https://meauxcloud.org",
    featured: true,
  },
  {
    slug: "automeaux",
    title: "AutoMeaux Learn",
    category: "Product",
    year: "2025",
    role: "EdTech platform",
    description:
      "iOS-quality learning with modular curriculum and analytics, production-ready on Cloudflare.",
    image: "/projects/kith.jpg",
  },
  {
    slug: "fuel-freetime",
    title: "Fuel & Free Time",
    category: "Brand",
    year: "2025",
    role: "Lifestyle · commerce",
    description:
      "Lafayette-born apparel. Full e-commerce stack, limited drops, and a community platform with end-to-end identity.",
    image: "/projects/fuel-freetime.jpg",
  },
  {
    slug: "pawlove",
    title: "PawLove Rescue",
    category: "Nonprofit",
    year: "2025",
    role: "CMS · donations",
    description:
      "Custom animal-management CMS, Stripe donations, D1, KV sessions, and transactional email.",
    image: "/projects/pawlove.jpg",
  },
  {
    slug: "agentsam",
    title: "AgentSam",
    category: "Platform",
    year: "2026",
    role: "Workmode · agents",
    description:
      "The command center for intelligent agents — trails, dual chats, browser, Monaco, and ship to Workers.",
    image: "/projects/harbor-press.jpg",
    href: "/agentsam",
  },
  {
    slug: "vespera-studio",
    title: "Studio systems",
    category: "Brand",
    year: "2024",
    role: "Identity & type",
    description:
      "Quiet identity systems — paper, type, and marks that hold across product, packaging, and the edge.",
    image: "/projects/vespera.jpg",
  },
];

export const skillGroups = [
  {
    heading: "Practice",
    items: ["Branding", "Digital products", "Websites"],
  },
  {
    heading: "Build",
    items: ["Edge development", "Content & motion", "Generative AI"],
  },
  {
    heading: "Operate",
    items: ["Workers + D1", "Agent routing", "CMS systems"],
  },
] as const;

export const navLinks = [
  { href: "#work", label: "Work" },
  { href: "#about", label: "About" },
  { href: "#skills", label: "Skills" },
  { href: "#contact", label: "Contact" },
] as const;
