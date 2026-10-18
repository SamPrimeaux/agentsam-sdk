import test from "node:test";
import assert from "node:assert/strict";
import { analyticsHosts } from "../backend/admin/analytics-health.js";

test("Cloudflare traffic filters resolve only from the selected installation's domain", () => {
  assert.deepEqual(analyticsHosts("customer-two.example"), {host:"customer-two.example",www:"www.customer-two.example"});
  assert.deepEqual(analyticsHosts("https://www.merchant.example/path"), {host:"www.merchant.example",www:"merchant.example"});
  assert.equal(analyticsHosts(""),null);
  assert.equal(analyticsHosts("http://localhost:8787"),null);
  assert.equal(analyticsHosts("https://bad host"),null);
});
