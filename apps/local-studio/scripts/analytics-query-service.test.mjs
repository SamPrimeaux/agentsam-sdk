import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAnalyticsRange,
  rangeStartUnix,
} from "../backend/worker/analytics-query-service.js";

test("unknown range falls back to 30d", () => {
  assert.equal(normalizeAnalyticsRange("wat"), "30d");
  assert.equal(normalizeAnalyticsRange("24h"), "24h");
  assert.equal(normalizeAnalyticsRange("All"), "All");
});

test("rolling ranges are deterministic", () => {
  const now = 2_000_000_000;
  assert.equal(rangeStartUnix("24h", now), now - 86_400);
  assert.equal(rangeStartUnix("7d", now), now - 604_800);
  assert.equal(rangeStartUnix("30d", now), now - 2_592_000);
  assert.equal(rangeStartUnix("90d", now), now - 7_776_000);
  assert.equal(rangeStartUnix("All", now), 0);
});

test("YTD starts at UTC Jan 1", () => {
  const now = Math.floor(Date.UTC(2026, 9, 3, 19, 0, 0) / 1000);
  assert.equal(
    rangeStartUnix("YTD", now),
    Math.floor(Date.UTC(2026, 0, 1, 0, 0, 0) / 1000),
  );
});
