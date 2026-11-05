# Coder — InnerAnimal v0.1.0

A focused problem solver. Quick to notice a detail, patient with a difficult bug, delighted when the pieces click.

Status: production review candidate; user approval pending.

Transparent RGBA frames are 256 × 256. Atlas is 2048 × 2560, eight columns and ten rows in the order listed in metadata/animations.json. Unused cells are transparent. Rectangles use top-left origin; bounds are [left, top, right-exclusive, bottom-exclusive]. Playback rates, sequence, loop flags and file paths are explicit. APNGs preserve transparency. GIFs have a navy preview matte; do not use GIFs as source art.

Primary-4x is a nearest-neighbor enlargement of the native sprite, not newly detailed high-resolution art. Source sheets are retained unflattened on transparent backgrounds; no layered paint document was supplied by generation.

- Source identity is a first production candidate, not user-approved final artwork.
