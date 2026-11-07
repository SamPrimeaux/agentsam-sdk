import React from "react";

export type CmsBillingEmbedContent = {
  heading?: string;
  description?: string;
  buttonLabel?: string;
  style?: "card" | "inline";
};

/**
 * CMS storefront entry: only links to a HOST-verified, authenticated account route.
 * No invoice amounts or customer identity are rendered on public storefront pages.
 * Theme editors own copy/appearance, never credentials or authorization targets.
 */
export function CmsBillingPortalEmbed({
  content,
  billingHref,
}: {
  content?: CmsBillingEmbedContent;
  /** Route resolved by the site/account host, never merchant-authored theme JSON. */
  billingHref?: string | null;
}) {
  const safeHref = typeof billingHref === "string" &&
    /^\/(?!\/)[a-z0-9/_?=.&%-]*$/i.test(billingHref)
    ? billingHref : null;
  return <section className={"agentsam-billing-embed agentsam-billing-embed-" + (content?.style === "inline" ? "inline" : "card")}
    data-agentsam-app-embed="customer-billing" aria-label="Customer billing portal">
    <div className="agentsam-billing-embed-copy">
      <h2>{content?.heading || "Your account billing"}</h2>
      <p>{content?.description || "Review your invoices, subscription, and payments in your secure account."}</p>
    </div>
    {safeHref ? <a href={safeHref} className="agentsam-billing-embed-action">
      {content?.buttonLabel || "View billing"}</a> :
      <span className="agentsam-billing-embed-unavailable" role="status">
        Secure billing access has not been enabled for this site.
      </span>}
  </section>;
}
