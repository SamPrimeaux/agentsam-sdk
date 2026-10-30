# CoPro creative package verification — 2026-10-30

Status: source-package prototype; standalone local gallery. Not integrated into Studio and not a production video-export release.

- Mac Node 22.23.3: template/render tests passed (13 tests before plugin tests).
- Canonical plugin migration executed against in-memory SQLite for optional install, native runtime dispatch, two-principal isolation, stale installation rejection, immediate disablement, preserved disabled preference and module opt-in. Two new integration tests passed; three existing preference regressions passed.
- Real official GSAP 3.15.0 distribution: optional native dispatcher returned power2.out(0.5) = 0.875. Distribution remained in `/tmp`, outside shipped packages.
- Chrome 155 browser verification: 36 shaders × five sample times, endpoint pixels and repeat hashes; 18 compositions × three raster samples; 36 animations; eight overlays; WebGL simulated loss/recovery passed. No test failures. Safari not tested.
- Gallery project download was inspected from Downloads: `copro.project.v1`, microsecond timebase, edited headline `Build with purpose` survived in generator clip parameters.
- Shader compile failure, WebGL absence, malformed parameters and unknown presets report explicit errors. Source gallery has no framework/network/runtime dependency.

Reproducible browser checks live in `packages/copro-templates/preview/verify.html`; commands and integration boundaries are in `docs/handoffs/COPRO_CREATIVE_V1_AGENT2.md`. The browser proof does not certify encoded-video export or hosted Studio routes.
