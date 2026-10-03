import { describe, expect, it } from "vitest";
import {
  HYPERSPACE_STUDIES,
  studyForSemantic,
} from "../src/renderer/study-selection.js";

describe("Computational Hyperspace study registry", () => {
  it("ships all six reusable fullscreen studies", () => {
    expect(HYPERSPACE_STUDIES.map((study) => study.id)).toEqual([
      "runway",
      "signal",
      "layers",
      "quantum",
      "merkle",
      "horizon",
    ]);
  });

  it("routes runtime semantics into the six visual families", () => {
    expect(studyForSemantic("boot")).toBe("runway");
    expect(studyForSemantic("reading")).toBe("signal");
    expect(studyForSemantic("context_loading")).toBe("layers");
    expect(studyForSemantic("parallel_execution")).toBe("quantum");
    expect(studyForSemantic("verification")).toBe("merkle");
    expect(studyForSemantic("deployment")).toBe("horizon");
  });
});
