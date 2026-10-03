import { describe, expect, it } from "vitest";
import {
  HYPERSPACE_STUDIES,
  studyForSemantic,
} from "../src/renderer/study-selection.js";

describe("Computational Hyperspace study registry", () => {
  it("ships all nine reusable fullscreen studies", () => {
    expect(HYPERSPACE_STUDIES.map((study) => study.id)).toEqual([
      "runway",
      "signal",
      "layers",
      "quantum",
      "merkle",
      "horizon",
      "vector",
      "gamut",
      "thread",
    ]);
  });

  it("routes general runtime semantics into the original visual families", () => {
    expect(studyForSemantic("boot")).toBe("runway");
    expect(studyForSemantic("reading")).toBe("signal");
    expect(studyForSemantic("context_loading")).toBe("layers");
    expect(studyForSemantic("parallel_execution")).toBe("quantum");
    expect(studyForSemantic("verification")).toBe("merkle");
    expect(studyForSemantic("deployment")).toBe("horizon");
  });

  it("routes manufacturing diagnostics into specialized studies", () => {
    expect(studyForSemantic("asset_ingest")).toBe("runway");
    expect(studyForSemantic("preflight")).toBe("merkle");
    expect(studyForSemantic("vectorization")).toBe("vector");
    expect(studyForSemantic("color_normalization")).toBe("gamut");
    expect(studyForSemantic("manufacturing_compile")).toBe("horizon");
    expect(studyForSemantic("digitization_handoff")).toBe("thread");
    expect(studyForSemantic("receipt_persistence")).toBe("horizon");
    expect(studyForSemantic("workspace_cleanup")).toBe("signal");
  });
});
