import { useState } from "react";
import StudioIcon from "./StudioIcon";
export default function ProductImage({
  sources,
  alt = "",
  lazy = true,
}: {
  sources: (string | undefined)[];
  alt?: string;
  lazy?: boolean;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = sources.find((s) => s && !failed.includes(s));
  const proxy = src?.startsWith("https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/")
    ? "/catalog-image?src=" + encodeURIComponent(src) : null;
  return src ? (
    <img
      src={proxy ? proxy + "&w=640" : src}
      srcSet={proxy ? [320, 640, 1200].map(w => proxy + "&w=" + w + " " + w + "w").join(", ") : undefined}
      sizes="(max-width: 760px) 50vw, (max-width: 1200px) 25vw, 320px"
      alt={alt}
      loading={lazy ? "lazy" : "eager"}
      decoding="async"
      onError={() => setFailed((prev) => [...prev, src])}
    />
  ) : (
    <span
      className="ps-image-fallback"
      role="img"
      aria-label={alt || "Product image unavailable"}
    >
      <StudioIcon name="box" size={40} />
      <small>Image unavailable</small>
    </span>
  );
}
