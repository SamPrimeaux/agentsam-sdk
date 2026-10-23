# AgentSam Desktop Pet

Status: implemented in Local Studio source; packaged release verification required.

The canonical art source is agentsam-sdk/assets/brand/agentsam-gorilla/v1/. Local Studio bundles the required runtime files under frontend/public/brand/agentsam-gorilla/v1/ so the installed app does not depend on the source checkout.

The optional Tauri window uses a transparent webview, stays above other windows, opens near the primary display lower-right edge, can be dragged by its handle, and can be hidden from Local Studio navigation. Clicking the sprite cycles bundled states. Idle and working use supplied animated GIFs; other states use supplied SVG artwork.

This is a 2D starter pet, not a 3D rig. Motion is limited to source assets and UI-triggered state changes.
