# PrimeTech onboarding + landing

Static page: 3-step setup (name, company, focus) then the PrimeTech landing page.
Open `index.html` over any static server; `#tour` skips setup.

- `assets/scene.js` is the hero scene from cad.inneranimalmedia.com (three.js), trimmed to run only inside `#hero`.
- `assets/three.module-*.js` and `companions/` are its dependencies.
- Every section is numbered in the HTML comments and `data-sec` attributes; press Shift+N on the page to show the numbers.
- All copy and options live in the `CONFIG` object at the top of the inline script in `index.html`.
