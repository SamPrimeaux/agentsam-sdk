import { describe, expect, it } from "vitest";
import { evaluateDeleteSafety } from "../src/core/usage.js";

describe("usage graph delete safety", () => {
  it("refuses when live surfaces reference the asset", () => {
    const safety = evaluateDeleteSafety([
      { app: "ember", surface: "home.hero", live: true },
      { app: "ember", surface: "about.story", live: true },
      { app: "agentsam", surface: "brand-story.gallery", live: true },
    ]);
    expect(safety.safe).toBe(false);
    expect(safety.reason).toBe("No. Used in 3 live surfaces.");
  });

  it("allows with last-used context when only historical references exist", () => {
    const detachedAt = new Date(Date.now() - 94 * 86_400_000).toISOString();
    const safety = evaluateDeleteSafety([
      { app: "iam", surface: "case-study.ember", live: false, detachedAt },
    ]);
    expect(safety.safe).toBe(true);
    expect(safety.reason).toContain("Last used 94 days ago");
  });

  it("allows when never referenced", () => {
    const safety = evaluateDeleteSafety([]);
    expect(safety.safe).toBe(true);
    expect(safety.reason).toContain("Never referenced");
  });
});
