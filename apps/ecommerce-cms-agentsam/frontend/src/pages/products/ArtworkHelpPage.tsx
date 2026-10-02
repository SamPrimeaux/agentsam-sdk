import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "../../styles/provider-help.css";

type Company = {
  name?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  supportEmail?: string | null;
  websiteUrl?: string | null;
  tagline?: string | null;
};

const COMPLETEFUL = {
  help: "https://completeful.com/help-center",
  artwork: "https://completeful.com/help-center/design-printing/artwork-guidelines",
  formats: "https://completeful.com/help-center/design-printing/file-formats",
  color: "https://completeful.com/help-center/design-printing/color-accuracy",
  mockups: "https://completeful.com/help-center/design-printing/mockup-generator",
  specs: "https://completeful.com/help-center/design-printing/product-specs",
  support: "https://completeful.com/contact",
} as const;

const formatCards = [
  {
    name: "PNG",
    badge: "Recommended",
    bestFor: "Logos, text, isolated graphics, transparency",
    notes: "Lossless raster format with transparency. Target 300 DPI at final print size and RGB/sRGB.",
    limit: "Completeful: up to 20 MB",
  },
  {
    name: "JPG / JPEG",
    bestFor: "Photography, gradients, full-background artwork",
    notes: "Good for photographic artwork, but it cannot preserve transparency. Target 300 DPI and RGB/sRGB.",
    limit: "Completeful: up to 20 MB",
  },
  {
    name: "SVG",
    bestFor: "Logos, icons, simple vector illustration and text",
    notes: "Scales cleanly. Complex vector artwork may be better supplied as a normalized PNG or PDF.",
    limit: "Completeful: up to 5 MB",
  },
  {
    name: "PDF",
    bestFor: "Professional print-ready vector documents",
    notes: "Preserves vector and font information. Embed fonts or outline text before production.",
    limit: "Completeful: up to 50 MB",
  },
];

function normalizedWebsiteUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function ExternalLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

export default function ArtworkHelpPage() {
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/company", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as { company?: Company };
        return payload.company || null;
      })
      .then((nextCompany) => {
        if (!controller.signal.aborted && nextCompany) setCompany(nextCompany);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    document.title = company?.name
      ? `Artwork Help — ${company.name} Admin`
      : "Artwork Help — Admin";
  }, [company?.name]);

  const brandName = company?.name || "Your store";
  const brandWebsite = normalizedWebsiteUrl(company?.websiteUrl);
  const pageStyle = {
    "--provider-help-accent": company?.primaryColor || "#6f8458",
  } as CSSProperties;

  return (
    <section className="provider-help" style={pageStyle} aria-label="Artwork help">
      <header className="provider-help__brandbar">
        <div className="provider-help__brand">
          {company?.logoUrl ? (
            <img src={company.logoUrl} alt="" />
          ) : (
            <span className="provider-help__brandmark" aria-hidden="true">
              {brandName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span>
            <strong>{brandName}</strong>
            <small>Product artwork help</small>
          </span>
        </div>
        <nav aria-label="Artwork help actions">
          <Link to="/products/create">Back to Product Studio</Link>
          <ExternalLink href={COMPLETEFUL.help}>Completeful Help Center</ExternalLink>
        </nav>
      </header>

      <main className="provider-help__main">
        <section className="provider-help__hero">
          <span className="provider-help__eyebrow">ARTWORK PREP & PRODUCTION</span>
          <h1>
            Make the artwork clean.
            <br />
            <em>Keep the production file intentional.</em>
          </h1>
          <p>
            Use this guide before preparing a product or sending artwork to Completeful.
            Product-specific print areas, materials, and production methods still win over
            general file-format advice.
          </p>
          <div className="provider-help__actions">
            <Link className="provider-help__button provider-help__button--primary" to="/products/create">
              Open Product Studio
            </Link>
            <ExternalLink className="provider-help__button" href={COMPLETEFUL.artwork}>
              Official artwork guidelines
            </ExternalLink>
          </div>
        </section>

        <section className="provider-help__section" aria-labelledby="artwork-checklist">
          <div className="provider-help__section-heading">
            <span>01</span>
            <div>
              <small>BEFORE UPLOAD</small>
              <h2 id="artwork-checklist">Quick artwork checklist</h2>
            </div>
          </div>
          <div className="provider-help__checklist">
            <article>
              <strong>300 DPI</strong>
              <p>For raster artwork, aim for 300 DPI at the final intended print size whenever possible.</p>
            </article>
            <article>
              <strong>Respect the safe zone</strong>
              <p>Keep logos, faces, type, and other critical details inside the product’s defined print-safe area.</p>
            </article>
            <article>
              <strong>Remove accidental backgrounds</strong>
              <p>Anything visible in the uploaded file can become printable artwork. Preserve transparency for isolated designs.</p>
            </article>
            <article>
              <strong>Use sRGB</strong>
              <p>Design in RGB/sRGB for the most predictable compatibility with Completeful’s production workflow.</p>
            </article>
            <article>
              <strong>Keep the master</strong>
              <p>Upload the highest-quality source you have. Product Studio should derive production files without destroying the original.</p>
            </article>
            <article>
              <strong>Use artwork you can legally print</strong>
              <p>Only submit artwork you own or have permission to use for the intended product.</p>
            </article>
          </div>
        </section>

        <section className="provider-help__callout">
          <div>
            <span className="provider-help__eyebrow">TRANSPARENCY MATTERS</span>
            <h2>A matching background color is still a background.</h2>
          </div>
          <p>
            On apparel, drinkware, and other products, an unwanted white, black, or colored
            rectangle can print as part of the design. For isolated logos, lettering, and
            graphics, transparent PNG is Completeful’s safest general-purpose recommendation.
          </p>
          <ExternalLink href={COMPLETEFUL.artwork}>See Completeful’s background examples</ExternalLink>
        </section>

        <section className="provider-help__section" aria-labelledby="file-formats">
          <div className="provider-help__section-heading">
            <span>02</span>
            <div>
              <small>CHOOSE THE RIGHT SOURCE</small>
              <h2 id="file-formats">Supported artwork formats</h2>
            </div>
          </div>
          <div className="provider-help__formats">
            {formatCards.map((format) => (
              <article key={format.name}>
                <div>
                  <h3>{format.name}</h3>
                  {format.badge && <span>{format.badge}</span>}
                </div>
                <strong>{format.bestFor}</strong>
                <p>{format.notes}</p>
                <small>{format.limit}</small>
              </article>
            ))}
          </div>
          <p className="provider-help__fineprint">
            Fuel & Free Time’s Product Studio may intentionally enforce a stricter local
            upload limit than Completeful for some formats. A local limit is an application
            policy, not a statement that Completeful rejects the provider-supported format.
          </p>
          <ExternalLink href={COMPLETEFUL.formats}>Open Completeful’s file-format guide</ExternalLink>
        </section>

        <section className="provider-help__split">
          <article>
            <span className="provider-help__eyebrow">COLOR</span>
            <h2>Screen color is a preview, not a material guarantee.</h2>
            <p>
              Cotton, stainless steel, ceramic, coated surfaces, and other materials can
              reproduce the same digital color differently. Avoid relying on neon, metallic,
              or glow effects as exact physical output, and order samples when color is critical.
            </p>
            <ExternalLink href={COMPLETEFUL.color}>Color accuracy & profiles</ExternalLink>
          </article>
          <article>
            <span className="provider-help__eyebrow">PRODUCT GEOMETRY</span>
            <h2>The selected print or engraving area is the real target.</h2>
            <p>
              Product Studio should use Completeful’s product and print-location dimensions,
              DPI, placement geometry, and supported production method to prepare the final
              rendition. Do not assume one logo export is correct for every product.
            </p>
            <ExternalLink href={COMPLETEFUL.specs}>Product size & specifications</ExternalLink>
          </article>
        </section>

        <section className="provider-help__section" aria-labelledby="product-specs">
          <div className="provider-help__section-heading">
            <span>03</span>
            <div>
              <small>PRODUCT SIZE & SPECIFICATIONS</small>
              <h2 id="product-specs">Carry the provider’s real product details into the listing.</h2>
            </div>
          </div>
          <div className="provider-help__checklist">
            <article>
              <strong>Size & dimensions</strong>
              <p>
                Use the provider’s product measurements as the source for customer-facing
                dimensions. For apparel, include the relevant size-chart measurements so
                buyers can compare before ordering.
              </p>
            </article>
            <article>
              <strong>Material & finish</strong>
              <p>
                Preserve the actual fabric blend, substrate, coating, finish, or construction
                details. These can affect both the product description and how artwork renders.
              </p>
            </article>
            <article>
              <strong>Care instructions</strong>
              <p>
                Bring important care notes into the storefront description, such as washing,
                drying, dishwasher, or handling guidance supplied for the selected product.
              </p>
            </article>
            <article>
              <strong>Print / engraving area</strong>
              <p>
                Treat Completeful’s maximum printable or engravable area as the production
                boundary. Keep the design inside it and use the selected placement preview.
              </p>
            </article>
            <article>
              <strong>Wraps & complex placements</strong>
              <p>
                Pay extra attention to seams, edges, curves, wraps, and multi-view placements.
                A flat artwork file alone does not prove the final physical alignment.
              </p>
            </article>
            <article>
              <strong>Storefront-ready specs</strong>
              <p>
                Add useful dimensions, size tables, material details, and care notes directly
                to the product listing in concise, scannable language.
              </p>
            </article>
          </div>
          <p className="provider-help__fineprint">
            The catalog/product record should remain the product-specific authority. This help
            page explains the workflow; it should not replace Completeful’s live specifications
            for the selected product and variant.
          </p>
          <ExternalLink href={COMPLETEFUL.specs}>Open Completeful’s product size & specifications guide</ExternalLink>
        </section>

        <section className="provider-help__section" aria-labelledby="provider-resources">
          <div className="provider-help__section-heading">
            <span>04</span>
            <div>
              <small>OFFICIAL COMPLETEFUL RESOURCES</small>
              <h2 id="provider-resources">Go straight to the provider when you need it.</h2>
            </div>
          </div>
          <div className="provider-help__resources">
            <ExternalLink href={COMPLETEFUL.artwork}>
              <strong>Artwork upload guidelines</strong>
              <small>Resolution, safe zones, backgrounds, file prep and rights.</small>
            </ExternalLink>
            <ExternalLink href={COMPLETEFUL.formats}>
              <strong>Supported file formats</strong>
              <small>PNG, JPEG, SVG, PDF and provider file-size guidance.</small>
            </ExternalLink>
            <ExternalLink href={COMPLETEFUL.color}>
              <strong>Color accuracy and profiles</strong>
              <small>sRGB, material differences and sample recommendations.</small>
            </ExternalLink>
            <ExternalLink href={COMPLETEFUL.mockups}>
              <strong>Mockup generator</strong>
              <small>Provider guidance for artwork placement and mockup views.</small>
            </ExternalLink>
            <ExternalLink href={COMPLETEFUL.specs}>
              <strong>Product size & specifications</strong>
              <small>Materials, dimensions, print areas and engraving areas.</small>
            </ExternalLink>
            <ExternalLink href={COMPLETEFUL.support}>
              <strong>Contact Completeful support</strong>
              <small>Open the provider’s contact/support form when documentation is not enough.</small>
            </ExternalLink>
          </div>
        </section>

        <section className="provider-help__support">
          <div>
            <span className="provider-help__eyebrow">STILL STUCK?</span>
            <h2>Keep the issue attached to the product you are working on.</h2>
            <p>
              When escalating a production question, include the Completeful product/SKU,
              selected variant, print or engraving location, source format, screenshot or
              mockup, and the exact error or unexpected output. That makes provider support
              much more actionable.
            </p>
          </div>
          <div className="provider-help__support-actions">
            <ExternalLink className="provider-help__button provider-help__button--primary" href={COMPLETEFUL.support}>
              Open Completeful support
            </ExternalLink>
            {company?.supportEmail && (
              <a className="provider-help__button" href={`mailto:${company.supportEmail}`}>
                Contact {brandName} support
              </a>
            )}
          </div>
        </section>
      </main>

      <footer className="provider-help__footer">
        <div className="provider-help__footer-brand">
          {company?.logoUrl && <img src={company.logoUrl} alt="" />}
          <span>
            <strong>{brandName}</strong>
            <small>{company?.tagline || "Create carefully. Ship confidently."}</small>
          </span>
        </div>
        <div>
          {brandWebsite && (
            <a href={brandWebsite} target="_blank" rel="noreferrer">
              Visit store
            </a>
          )}
          {company?.supportEmail && <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a>}
          <ExternalLink href={COMPLETEFUL.help}>Completeful Help Center</ExternalLink>
        </div>
      </footer>
    </section>
  );
}
