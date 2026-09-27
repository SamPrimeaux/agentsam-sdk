import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  IllegalTransitionError,
} from "../src/core/origin.js";

describe("content lifecycle", () => {
  it("follows the generated → draft → review → approved → live path", () => {
    expect(canTransition("draft", "review")).toBe(true);
    expect(canTransition("review", "approved")).toBe(true);
    expect(canTransition("review", "rejected")).toBe(true);
    expect(canTransition("approved", "live")).toBe(true);
    expect(canTransition("live", "superseded")).toBe(true);
  });

  it("blocks illegal jumps", () => {
    expect(canTransition("draft", "live")).toBe(false);
    expect(canTransition("rejected", "live")).toBe(false);
    expect(() => assertTransition("draft", "live")).toThrow(IllegalTransitionError);
  });

  it("allows restore from archive", () => {
    expect(canTransition("archived", "draft")).toBe(true);
  });
});
