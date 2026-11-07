import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CmsBillingPortalEmbed } from "../dist/ui/cms-billing-portal-embed.js";

test("public CMS embed never invents customer invoice values or links", () => {
  const html = renderToStaticMarkup(React.createElement(CmsBillingPortalEmbed, {
    content: { heading: "Payments", buttonLabel: "Open billing" },
  }));
  assert.match(html, /Payments/);
  assert.match(html, /not been enabled/);
  assert.doesNotMatch(html, /href=/);
  assert.doesNotMatch(html, /\$0\.00/);
});

test("only host-supplied safe relative account routes are renderable", () => {
  const valid = renderToStaticMarkup(React.createElement(CmsBillingPortalEmbed, {
    billingHref: "/account/billing",
    content: { style: "inline", buttonLabel: "View invoices" },
  }));
  assert.match(valid, /href="\/account\/billing"/);
  assert.match(valid, /View invoices/);
  const unsafe = renderToStaticMarkup(React.createElement(CmsBillingPortalEmbed, {
    billingHref: "//lookalike.example.com/login",
  }));
  assert.doesNotMatch(unsafe, /href=/);
});
