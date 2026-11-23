# PrimeTech public interactive experience

Static page: 3-step setup (name, company, focus) then the PrimeTech landing page.
Open `index.html` over any static server; `#tour` skips setup.

- `assets/scene.js` is the hero scene from cad.inneranimalmedia.com (three.js), trimmed to run only inside `#hero`.
- `assets/three.module-*.js` and `companions/` are its dependencies.
- Every section is numbered in the HTML comments and `data-sec` attributes; press Shift+N on the page to show the numbers.
- All copy and options live in the `CONFIG` object at the top of the inline script in `index.html`.

## Public distribution

The single source is this directory. The MovieMode app's `agentsam.app.json`
registers it as a `public_mount` at `/primetech/experience/` on the AgentSam
public host. `build-included-apps.mjs --stage` copies the already-built content
into that public path, without adding another source implementation.

- Public showcase: `/primetech/experience/#tour`
- Public setup intro: `/primetech/experience/`
- Historical `/moviemode/primetech-onboarding/` asset links remain readable
  for compatibility, but **no authenticated CoPro screen navigates to them**.
- Completion opens the normal account sign-up/sign-in flow; the tour is not
  an account-enrollment requirement for an existing dashboard user.
- The embedded Assistant is demonstrative unless a supported AI service is connected.

- App Store shared Assistant preview: `/primetech/experience/?assistantPreview=1#tour` (same popup code, simulated delivery only).
