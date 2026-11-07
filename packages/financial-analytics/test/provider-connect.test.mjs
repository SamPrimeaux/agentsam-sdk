import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinancialProviderConnectFlow } from "../dist/ui/provider-connect-flow.js";
import { validateFinancialAuthorizationUrl } from "../dist/index.js";

test("provider handoff accepts HTTPS and local development URLs only", () => {
  assert.equal(
    validateFinancialAuthorizationUrl("https://connect.example.com/authorize?state=opaque"),
    "https://connect.example.com/authorize?state=opaque",
  );
  assert.equal(validateFinancialAuthorizationUrl("http://localhost:3000/callback"), "http://localhost:3000/callback");
  assert.throws(() => validateFinancialAuthorizationUrl("javascript:alert(1)"), /insecure/);
  assert.throws(() => validateFinancialAuthorizationUrl("http://payments.example.com/start"), /insecure/);
  assert.throws(() => validateFinancialAuthorizationUrl("https://user:pass@example.com/start"), /credentials/);
  assert.throws(() => validateFinancialAuthorizationUrl("/callback"), /Invalid URL/);
});

test("flow renders dynamic providers without a hardcoded provider catalog", () => {
  const markup = renderToStaticMarkup(React.createElement(FinancialProviderConnectFlow, {
    open: true,
    onClose: () => {},
    providers: [
      { id: "provider-x", name: "Provider X", description: "Payments", status: "available" },
      { id: "provider-y", name: "Provider Y", status: "connected" },
      { id: "provider-z", name: "Provider Z", status: "unavailable" },
      { id: "provider-a", name: "Provider A", status: "action_required" },
    ],
  }));
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Provider X/);
  assert.match(markup, /Provider Y/);
  assert.match(markup, /Connected/);
  assert.match(markup, /Needs attention/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>.*?Provider Z/s);
  assert.doesNotMatch(markup, /Stripe|PayPal/);
});

test("no connection options is a real empty state rather than a fake success", () => {
  const markup = renderToStaticMarkup(React.createElement(FinancialProviderConnectFlow, {
    open: true, onClose: () => {}, providers: [],
  }));
  assert.match(markup, /No connection options yet/);
  assert.doesNotMatch(markup, /Continue securely/);
});

test("closed flow renders nothing", () => {
  assert.equal(renderToStaticMarkup(React.createElement(FinancialProviderConnectFlow, {
    open: false, onClose: () => {}, providers: [],
  })), "");
});
