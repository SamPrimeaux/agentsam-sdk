const thumbnailModules = import.meta.glob("../preview/thumbnails/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

export const CREATIVE_THUMBNAILS = Object.fromEntries(
  Object.entries(thumbnailModules).map(([path, url]) => [path.split("/").pop(), url]),
);
