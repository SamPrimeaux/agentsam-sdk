# @inneranimalmedia/copro-templates

Structured creative templates for CoPro.

Templates describe canvas, slots, track skeletons, captions, transitions, audio cues, text styles, and generation slots without binding the project to a render or storage provider.

## Creative V1 package prototype

Subpath `./creative` exports 18 editable compositions and deterministic SVG frame sampling. `./motion` exports 36 animation variants, overlays, treatments, typewriter and counter sampling. Projects retain the existing integer-microsecond format. No Remotion or React runtime was added.

Run `npm run build:gallery`, then `npm run preview` from this package to open the standalone gallery. It serves the repository's package sources locally; it is a development server, not a production host. The gallery also requires the sibling `copro-render` source package for live transitions. Consumers of creative sampling do not require that sibling gallery.

See `../../docs/handoffs/COPRO_CREATIVE_V1_AGENT2.md` for host integration, limitations and source decisions. Keep `THIRD_PARTY_NOTICES.md` and `provenance.json` with distributions.
