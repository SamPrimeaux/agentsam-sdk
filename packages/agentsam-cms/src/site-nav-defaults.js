export const DEFAULT_NAV_ITEMS = [
  { id: "home", label: "Home", href: "/", matchPrefixes: ["/", "/index.html"] },
  {
    id: "shop",
    label: "Shop",
    href: "/shop",
    matchPrefixes: ["/shop", "/products/", "/collections/"],
  },
  { id: "about", label: "About", href: "/about", matchPrefixes: ["/about"] },
  {
    id: "community",
    label: "Community",
    href: "/community",
    matchPrefixes: ["/community"],
  },
];
