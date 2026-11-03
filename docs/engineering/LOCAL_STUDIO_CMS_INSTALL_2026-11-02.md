# Local Studio — installed Ecommerce CMS recovery

## Delivered in SDK branch `feat/localstudio-cms-installed-20261102`

- Recovered existing PR #426 (`9de57d34`) as cherry-pick `96e46f5f`: catalog resources install to CMS-owned page sections and blocks, support edit/save/reload/remove, account-scoped persistence and tests.
- Preserved the canonical Ecommerce CMS application; no replacement CMS, schema or Worker.
- Fixed Tauri's `/sites` route so it opens the installed Ecommerce Store, not a non-SPA `/admin/store` address.
- Fixed Page Editor `?slug`, Theme Editor showcase/catalog query handling while rejecting unrelated and duplicate parameters.
- Programmatic route changes in Pages, Page Editor and Theme Editor now forward through Local Studio's installed app host; standalone Ecommerce retains normal document navigation.
- Removed Fuel N Free Time-specific branding, domain and assistant prompts from the reusable Page Editor; unverified site URLs remain explicitly unverified.
- Updated misleading browser acceptance test that expected a `fuelnfreetime.com` iframe; acceptance now checks the actual same-origin packaged desktop Store, Pages, Page Editor, and Theme Editor.
- Desktop smoke server correctly serves JS modules and SPA fallback routes; no visual golden baselines were rewritten.

## Tests and limits

Ecommerce CMS typecheck/site-first tests, catalog install tests, editor navigation contracts, desktop asset build, Chrome desktop shell smoke, and installed CMS package smoke passed locally.

Two optional DOM tests skipped because jsdom was not installed. Existing `smoke:themes` failed on a **Work-home** screenshot difference; this CMS change does not approve that visual baseline.

Not yet validated: signed-in native-Tauri CMS editing/publishing against an authorized real site. The user's currently installed application has not been replaced, and no customer production data or Worker was changed. Pages has no general new-page POST endpoint; the UI refuses unsupported page creation instead of faking it.

The SDK's other divergent CMS/Theme Studio/Form Studio branches and existing stashes/worktrees remain intact; review them independently, do not merge wholesale. The selected site's Worker and account permissions must remain the authority for D1/R2 reads/writes.
