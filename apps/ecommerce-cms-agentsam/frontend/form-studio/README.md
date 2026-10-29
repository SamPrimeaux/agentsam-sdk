# Form & Modal Studio (SDK-owned)
This app is part of **@inneranimalmedia/ecommerce-cms-agentsam**, not a tenant-owned clone.

\`frontend/form-studio/index.mjs\` exports:
- \`createFormStudioComponent(React)\` — reusable UI component factory
- \`assertFormStudioAdapter(adapter)\` — strict host contract
- \`normalizeStudioResource\`, \`filterStudioResources\` — pure adapters/helpers

The host must provide an authenticated, tenant-scoped adapter:
- \`capabilities\` map such as \`forms.create\`, \`forms.edit\`, \`forms.publish\`, \`modals.openSource\`
- \`listResources()\`, \`getResource(ref)\`, \`createFromPreset(preset)\`, \`saveResource(doc)\`, \`publishResource(doc)\`
- optional \`openSource(doc)\` for resources whose canonical editor is not migrated

\`FormStudio\` accepts \`{adapter,presets,onExit,title}\`; render with a React runtime supplied by the host. The SDK never ships a second React copy. The host also mounts \`styles.css\`, using the same --color-* chrome tokens as the portable Theme Studio.

The editor is a **real form authoring surface**, not a themed iframe: it loads real field definitions and permits adding/editing/saving and publishing when the adapter enables those methods. It previews without making submissions. Modal and checkout records can be listed through the registry now; editing remains capability-gated until their server-side adapters are connected. Disabled operations must not imply successful publishing.

\`apps/form-studio/presets.json\` is the reusable preset catalog. A preset can be instantiated only if the host supports its kind and creation capability. Presets never copy customer payment credentials or production data.

Customer onboarding: publish this package, install a **specific verified package version** in the customer repo, and generate its browser bundle from this entrypoint. The generated asset should include package version + sha metadata. Do not copy/paste this source into individual tenant pages. Verify the deployed bundle and source are identical before retiring the existing editor.

No customer name, site route, event title, D1 table, or Stripe configuration exists in this module.
