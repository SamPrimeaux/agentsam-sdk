import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminFetch } from "../../lib/api";
import StudioIcon from "./StudioIcon";
import ProductImage from "./ProductImage";
import StudioWorkspace from "./StudioWorkspace";
import {
  catalogProductId,
  catalogVariantId,
  costLabel,
  normalizeCatalogProduct,
  normalizeVariant,
  printSizeLabel,
  productImage,
  selectVariantForAxis,
  variantAttributes,
  variantAxes,
  variantAxisValues,
  variantImage,
  type CatalogProduct,
  type CatalogResponse,
  type ProductDetail,
} from "./studio-model";
import "../../styles/product-studio.css";

const collections = [
  { name: "Everything", query: "", caption: "Find your next idea" },
  { name: "Tees", query: "shirt", caption: "Made to be worn" },
  { name: "Tumblers", query: "tumbler", caption: "Everyday essentials" },
  { name: "Framed decor", query: "frame", caption: "Make a space their own" },
  { name: "Hats", query: "hat", caption: "Small things. Big personality." },
];
export default function ProductStudioPage() {
  const navigate = useNavigate();
  const { productId } = useParams();
  const surface = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [designing, setDesigning] = useState(false);
  const [gallery, setGallery] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  useEffect(() => {
    surface.current?.scrollIntoView({ block: "start" });
  }, [productId, designing]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (productId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError("");
      }
    });
    const params = new URLSearchParams({
      limit: "24",
      offset: String(offset),
      search,
    });
    adminFetch<CatalogResponse>(`/api/admin/completeful/catalog?${params}`, {
      signal: controller.signal,
    })
      .then((d) => {
        if (!controller.signal.aborted) {
          const items = (d.items || []).map((item) =>
            normalizeCatalogProduct(item as CatalogProduct & Record<string, unknown>),
          );
          setCatalog((prev) => (offset ? [...prev, ...items] : items));
          setTotal(d.pagination.total);
          setMore(d.pagination.has_more);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [search, offset, refresh, productId]);
  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError("");
      }
    });
    adminFetch<ProductDetail>(
      `/api/admin/completeful/catalog/${encodeURIComponent(productId)}`,
      { signal: controller.signal },
    )
      .then((d) => {
        if (!controller.signal.aborted) {
          const normalized: ProductDetail = {
            product: normalizeCatalogProduct(
              (d.product || {}) as CatalogProduct & Record<string, unknown>,
            ),
            variants: (d.variants || []).map((v) =>
              normalizeVariant(v as Record<string, unknown>),
            ),
            print_locations: Array.isArray(d.print_locations) ? d.print_locations : [],
            images: Array.isArray(d.images) ? d.images : [],
            image_pagination: d.image_pagination,
            mockups: Array.isArray(d.mockups) ? d.mockups : [],
          };
          const initialVariant = normalized.variants[0];
          const initialImage =
            variantImage(initialVariant) ||
            productImage(normalized.product) ||
            normalized.images[0]?.url ||
            normalized.mockups.find((mockup) => mockup.active && mockup.preview_url)
              ?.preview_url ||
            "";
          setDetail(normalized);
          setSelectedVariantId(catalogVariantId(initialVariant));
          setGallery(initialImage);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [productId, refresh]);
  const stopSync = useRef(false);
  useEffect(() => () => { stopSync.current = true; }, []);
  async function syncCatalog() {
    stopSync.current = false;
    setSyncing(true);
    setError("");
    setNotice("Connecting to Completeful…");
    try {
      const state = await adminFetch<{ sync?: { next_cursor?: string; status?: string } }>("/api/admin/completeful/status");
      let reset = !state.sync?.next_cursor;
      let failures = 0;
      while (!stopSync.current) {
        const result = await adminFetch<{
          ok: boolean; status: string; has_more: boolean; retryable?: boolean;
          error?: string; detail?: string; counts?: { catalog_products: number };
        }>("/api/admin/completeful/catalog/sync", {
          method: "POST",
          body: JSON.stringify({ reset, limit: 3, max_pages: 1 }),
        });
        if (result.status === "busy" || (!result.ok && result.retryable)) {
          if (++failures > 3) throw new Error("Refresh paused after three retries. Tap Refresh catalog to resume.");
          setNotice(`Connection interrupted. Retrying batch (${failures}/3)…`);
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** failures));
          continue;
        }
        if (!result.ok) throw new Error(`${result.error || "Refresh paused"} ${result.detail || ""} Tap Refresh catalog to retry this batch.`);
        failures = 0;
        reset = false;
        setOffset(0);
        setRefresh(n => n + 1);
        setNotice(`${result.counts?.catalog_products ?? "Your"} products ready. ${result.has_more ? "Loading the next batch…" : "Catalog is up to date."}`);
        if (!result.has_more) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (stopSync.current) setNotice("Refresh paused. Your progress is saved; refresh to continue.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Refresh paused. Your products are still available.");
      setRefresh(n => n + 1);
    } finally { setSyncing(false); }
  }

  const selectedVariant =
    detail?.variants.find((variant) => catalogVariantId(variant) === selectedVariantId) ||
    detail?.variants[0];
  const selectedAttributes = variantAttributes(selectedVariant);
  const optionAxes = detail ? variantAxes(detail.variants) : [];
  const gallerySources = detail
    ? [
        ...new Set(
          [
            variantImage(selectedVariant),
            productImage(detail.product),
            ...detail.images.map((image) => image.url),
            ...detail.mockups
              .filter((mockup) => mockup.active)
              .map((mockup) => mockup.preview_url),
          ].filter((source): source is string => Boolean(source)),
        ),
      ].slice(0, 24)
    : [];

  function chooseVariant(variant: ProductDetail["variants"][number] | undefined) {
    if (!variant) return;
    setSelectedVariantId(catalogVariantId(variant));
    const nextImage = variantImage(variant);
    if (nextImage) setGallery(nextImage);
  }

  function chooseVariantOption(axis: string, value: string) {
    if (!detail) return;
    chooseVariant(
      selectVariantForAxis(detail.variants, selectedVariant, axis, value),
    );
  }

  return (
    <section
      ref={surface}
      className={`product-studio-shell${designing ? " is-designing" : ""}`}
      aria-label="Product Studio"
    >
      {designing && detail ? (
        <StudioWorkspace
          detail={detail}
          initialVariantId={selectedVariantId}
          onBack={() => setDesigning(false)}
        />
      ) : (
        <div className="ps-container">
          <div className="ps-topline">
            <span className="ps-eyebrow">THE CREATIVE STUDIO</span>
            {syncing && <button className="ps-button" onClick={() => { stopSync.current = true; }}>Pause refresh</button>}
            <div className="ps-topline-links">
              <a href="/admin/products/help/artwork">
                Artwork help <StudioIcon name="arrow" size={15} />
              </a>
              <a href="/admin/content">
                Your media library <StudioIcon name="arrow" size={15} />
              </a>
            </div>
          </div>
          {!productId ? (
            <>
              <header className="ps-hero">
                <div className="ps-hero-copy">
                  <span className="ps-kicker">
                    A little inspiration. Something entirely yours.
                  </span>
                  <h1>
                    Create &amp; explore
                    <br />
                    <em>your next idea.</em>
                  </h1>
                  <p>
                    Discover a product you love. Make it your own.
                    <br />
                    Bring your artwork, or start with a spark.
                  </p>
                  <a href="#studio-catalog" className="ps-button ps-primary">
                    Explore the catalog <StudioIcon name="arrow" size={18} />
                  </a>
                </div>
                <div className="ps-hero-products" aria-hidden="true">
                  {catalog.slice(0, 3).map((p, i) => (
                    <div
                      className={`ps-hero-tile tile-${i}`}
                      key={catalogProductId(p)}
                    >
                      <ProductImage
                        sources={[
                          p.realistic_image_url,
                          p.cover_image_url,
                          p.main_icon_url,
                        ]}
                        lazy={false}
                      />
                      <span>{p.product_type || "Make it yours"}</span>
                    </div>
                  ))}
                  {!catalog.length && (
                    <div className="ps-hero-empty">
                      <StudioIcon name="spark" size={72} />
                      <span>
                        GOOD IDEAS
                        <br />
                        START HERE.
                      </span>
                    </div>
                  )}
                  <span className="ps-hero-stamp">
                    YOUR IDEAS.
                    <br />
                    REAL POSSIBILITIES.
                  </span>
                </div>
              </header>
              <div className="ps-collections" aria-label="Browse collections">
                {collections.map((c, i) => (
                  <button
                    key={c.name}
                    className={query === c.query ? "is-active" : ""}
                    onClick={() => setQuery(c.query)}
                    aria-pressed={query === c.query}
                  >
                    <span className="ps-collection-number">0{i + 1}</span>
                    <strong>{c.name}</strong>
                    <small>{c.caption}</small>
                  </button>
                ))}
              </div>
              <div id="studio-catalog" className="ps-catalog-heading">
                <div>
                  <span className="ps-eyebrow">THE POSSIBILITIES</span>
                  <h2>Find your canvas.</h2>
                </div>
                <button
                  className="ps-text-button"
                  disabled={syncing}
                  onClick={syncCatalog}
                >
                  {syncing ? "Refreshing…" : "Refresh catalog"}
                </button>
              </div>
              <div className="ps-search-row">
                <label className="ps-search">
                  <StudioIcon name="search" />
                  <input
                    aria-label="Search Completeful products"
                    placeholder="Try tumblers, cotton, engraving…"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <span className="ps-result-count" aria-live="polite">
                  {loading && !offset
                    ? "Finding possibilities…"
                    : `${total} products`}
                </span>
              </div>
              {notice && (
                <p className="ps-notice" role="status">
                  {notice}
                </p>
              )}
              {error && (
                <div className="ps-feedback" role="alert">
                  <strong>We couldn’t load the catalog.</strong>
                  <p>{error}</p>
                  <button
                    className="ps-button"
                    onClick={() => setRefresh((n) => n + 1)}
                  >
                    Try again
                  </button>
                </div>
              )}
              {!loading && !error && !catalog.length && (
                <div className="ps-empty">
                  <StudioIcon name={search ? "search" : "box"} size={40} />
                  <h3>
                    {search
                      ? "A different search might spark something."
                      : "Let’s bring in your possibilities."}
                  </h3>
                  <p>
                    {search
                      ? "Try a product, material, or print method."
                      : "Load the latest Completeful products to explore images, options, and print areas."}
                  </p>
                  <button
                    className="ps-button ps-primary"
                    disabled={syncing}
                    onClick={search ? () => setQuery("") : syncCatalog}
                  >
                    {search
                      ? "See all products"
                      : syncing
                        ? "Loading catalog…"
                        : "Load products"}
                  </button>
                </div>
              )}
              <div className="ps-catalog-grid" aria-busy={loading}>
                {loading && !offset
                  ? Array.from({ length: 8 }, (_, i) => (
                      <div className="ps-skeleton" key={i}>
                        <div />
                        <span />
                        <span />
                      </div>
                    ))
                  : catalog.map((p) => (
                      <button
                        className="ps-product-card"
                        key={catalogProductId(p)}
                        onClick={() =>
                          navigate(
                            `/products/create/${encodeURIComponent(catalogProductId(p))}`,
                          )
                        }
                      >
                        <div className="ps-product-photo">
                          <ProductImage
                            sources={[
                              p.realistic_image_url,
                              p.cover_image_url,
                              p.main_icon_url,
                            ]}
                          />
                          <span className="ps-product-badge">
                            {p.print_type || "Customizable"}
                          </span>
                          <span className="ps-card-arrow">
                            <StudioIcon name="arrow" />
                          </span>
                        </div>
                        <div className="ps-product-copy">
                          <small>
                            {p.material ||
                              (p.product_type !== p.print_type
                                ? p.product_type
                                : "Completeful collection")}
                          </small>
                          <h3>{p.name}</h3>
                          <div>
                            <span>
                              {costLabel(p)}
                              <small> base cost</small>
                            </span>
                            <span>
                              {p.variant_count ?? 0}{" "}
                              {p.variant_count === 1 ? "option" : "options"}
                            </span>
                          </div>
                          {Number(p.available) === 0 && (
                            <small>Currently unavailable</small>
                          )}
                        </div>
                      </button>
                    ))}
              </div>
              {more && (
                <div className="ps-load-more">
                  <button
                    className="ps-button"
                    disabled={loading}
                    onClick={() => setOffset(catalog.length)}
                  >
                    {loading ? "Loading…" : "Explore more products"}
                  </button>
                  <span>
                    {catalog.length} of {total}
                  </span>
                </div>
              )}
              <footer className="ps-catalog-footer">
                <StudioIcon name="spark" />
                <span>
                  Your artwork. Your point of view. Your next collection.
                </span>
                <a href="/admin/agentsam">
                  Brainstorm with AgentSam <StudioIcon name="arrow" size={16} />
                </a>
              </footer>
            </>
          ) : (
            <>
              <button
                className="ps-text-button ps-back"
                onClick={() => navigate("/products/create")}
              >
                <StudioIcon name="back" size={18} /> Back to catalog
              </button>
              {loading && (
                <div className="ps-empty" role="status">
                  Opening your next canvas…
                </div>
              )}
              {error && (
                <div className="ps-feedback" role="alert">
                  {error}
                  <button
                    className="ps-button"
                    onClick={() => setRefresh((n) => n + 1)}
                  >
                    Try again
                  </button>
                </div>
              )}
              {detail && (
                <div className="ps-detail">
                  <div>
                    <div className="ps-detail-photo">
                      <ProductImage
                        sources={[
                          gallery,
                          variantImage(selectedVariant),
                          detail.product.realistic_image_url,
                          detail.product.cover_image_url,
                          detail.product.main_icon_url,
                          detail.images[0]?.url,
                          detail.mockups.find(
                            (mockup) => mockup.active && mockup.preview_url,
                          )?.preview_url,
                        ]}
                        alt={detail.product.name}
                        lazy={false}
                      />
                    </div>
                    {gallerySources.length > 1 && (
                      <div className="ps-thumbnails">
                        {gallerySources.map((src, i) => (
                          <button
                            key={src}
                            className={gallery === src ? "is-active" : ""}
                            onClick={() => setGallery(src)}
                            aria-label={`View product image ${i + 1}`}
                            aria-pressed={gallery === src}
                          >
                            <ProductImage sources={[src]} alt="" />
                          </button>
                        ))}
                      </div>
                    )}
                    {detail.image_pagination?.has_more && (
                      <p className="ps-image-count">
                        Showing a curated preview of {detail.image_pagination.total.toLocaleString()} provider images.
                      </p>
                    )}
                  </div>
                  <div className="ps-detail-copy">
                    <span className="ps-eyebrow">
                      {detail.product.product_type || "YOUR NEXT CANVAS"}
                    </span>
                    <h1>{detail.product.name}</h1>
                    <p>
                      {[detail.product.material, detail.product.print_type]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="ps-detail-cost">
                      <strong>{costLabel(selectedVariant || detail.product)}</strong>
                      <span>
                        Base fulfillment cost · Free plan
                        <br />
                        Shipping and taxes calculated separately
                      </span>
                    </div>
                    <div className="ps-detail-facts">
                      <div>
                        <strong>{detail.variants.length}</strong>
                        <span>Product options</span>
                      </div>
                      <div>
                        <strong>
                          {
                            (detail.print_locations || []).filter((l) => l.enabled)
                              .length
                          }
                        </strong>
                        <span>Print areas</span>
                      </div>
                      <div>
                        <strong>
                          {(detail.mockups || []).filter((m) => m.active).length}
                        </strong>
                        <span>Mockup views</span>
                      </div>
                    </div>
                    <h3>Make it yours</h3>
                    <p>
                      Bring in artwork from your library, explore a new
                      direction, and compose your design in one focused space.
                    </p>
                    <button
                      className="ps-button ps-primary ps-wide"
                      disabled={Number(detail.product.available) === 0}
                      onClick={() => setDesigning(true)}
                    >
                      {Number(detail.product.available) === 0
                        ? "Currently unavailable"
                        : "Start designing"}
                      <StudioIcon name="arrow" />
                    </button>
                    <div className="ps-detail-guidance">
                      <StudioIcon name="check" />
                      <span>
                        Keep original artwork at its highest quality. Print
                        requirements are available inside the studio.
                      </span>
                    </div>
                    <details className="ps-disclosure" open>
                      <summary>
                        Product options &amp; print requirements
                      </summary>
                      {selectedVariant && (
                        <p className="ps-selected-option">
                          <strong>{selectedVariant.variant_title || selectedVariant.name || "Default option"}</strong>
                          {selectedVariant.sku ? ` · ${selectedVariant.sku}` : ""}
                        </p>
                      )}
                      {optionAxes.length ? (
                        <div className="ps-option-groups">
                          {optionAxes.map((axis) => (
                            <div className="ps-option-group" key={axis}>
                              <span>{axis}</span>
                              <div className="ps-option-choices">
                                {variantAxisValues(detail.variants, axis).map((value) => {
                                  const previewVariant = detail.variants.find(
                                    (variant) => variantAttributes(variant)[axis] === value,
                                  );
                                  const showPreview = /color|finish|material|style|tone/i.test(axis);
                                  return (
                                    <button
                                      type="button"
                                      key={value}
                                      className={selectedAttributes[axis] === value ? "is-active" : ""}
                                      onClick={() => chooseVariantOption(axis, value)}
                                      aria-pressed={selectedAttributes[axis] === value}
                                    >
                                      {showPreview && variantImage(previewVariant) && (
                                        <ProductImage
                                          sources={[variantImage(previewVariant)]}
                                          alt=""
                                        />
                                      )}
                                      <span>{value}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="ps-option-tags">
                          {(detail.variants || []).map((variant) => (
                            <button
                              type="button"
                              key={catalogVariantId(variant)}
                              className={
                                catalogVariantId(selectedVariant) === catalogVariantId(variant)
                                  ? "is-active"
                                  : ""
                              }
                              onClick={() => chooseVariant(variant)}
                            >
                              {variant.variant_title || variant.name || "Default"}
                            </button>
                          ))}
                        </div>
                      )}
                      {(detail.print_locations || [])
                        .filter((location) => location.enabled)
                        .map((location) => (
                          <p key={location.print_location_id}>
                            <strong>{location.name}</strong> · {printSizeLabel(location)}
                            {location.dpi ? ` · ${location.dpi} DPI` : ""}
                          </p>
                        ))}
                    </details>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
