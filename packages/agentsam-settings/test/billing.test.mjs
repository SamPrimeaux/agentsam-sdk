import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBillingApi, safeBillingUrl, BILLING_NOT_CONFIGURED } from "../src/contracts/billing.ts";

test("billing records normalize existing authenticated endpoint shapes without invented amounts", () => {
  const model = normalizeBillingApi({
    subscriptions: [{ tenant_id:"tenant-a", plan_id:"plan-a", plan_display_name:"Studio", currency:"usd",
      status:"active", amount_cents:2500, billing_period:"monthly",
      current_period_end:1796500000, updated_at:1790000000 }],
  },{ invoices:[{ id:"in_a", status:"paid", amount_paid:2500,
    currency:"usd", invoice_pdf:"https://invoice.stripe.com/pdf/x", hosted_invoice_url:"https://invoice.stripe.com/i/x" }]});
  assert.equal(model.state, "ready");
  assert.equal(model.plan?.name, "Studio");
  assert.equal(model.plan?.amountMinor, 2500);
  assert.equal(model.plan?.currency, "USD");
  assert.equal(model.invoices[0]?.amountPaidMinor, 2500);
  assert.equal(model.invoices[0]?.currency, "USD");
  assert.equal(model.invoices[0]?.amountDueMinor, null);
});
test("missing sources never turn into a zero-dollar balance", () => {
  assert.equal(normalizeBillingApi({},{}).state, "unavailable");
  const empty = normalizeBillingApi({subscriptions:[]},{invoices:[]});
  assert.equal(empty.state, "ready");
  assert.equal(empty.plan, null);
  assert.equal(empty.invoices.length, 0);
  assert.equal(BILLING_NOT_CONFIGURED.plan, null);
});
test("invoice links reject credentials and script or HTTP schemes", () => {
  assert.equal(safeBillingUrl("javascript:alert(1)"), null);
  assert.equal(safeBillingUrl("http://example.com/pay"), null);
  assert.equal(safeBillingUrl("https://user:secret@example.com/"), null);
  assert.equal(safeBillingUrl("https://invoice.stripe.com/i/abc"),"https://invoice.stripe.com/i/abc");
});

test("currency is unknown unless confirmed by the provider", () => {
  const model = normalizeBillingApi({subscriptions:[{plan_id:"x",amount_cents:2000}]},
    {invoices:[{id:"in_x",amount_paid:2000}]});
  assert.equal(model.currency, null);
  assert.equal(model.plan?.currency, null);
  assert.equal(model.invoices[0].currency, null);
});
