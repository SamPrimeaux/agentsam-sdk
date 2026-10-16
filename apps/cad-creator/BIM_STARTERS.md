# Native BIM starters in CAD Creator

CAD Creator's **Model → BIM Starters** workspace reads the operator's **local private** BIM library. Original FreeCAD projects are not bundled into public web assets or uploaded to a Worker.

Import an original .FCStd with the app CLI (FreeCAD must be available on the same machine):

    node apps/cad-creator/bin/agentsam-cad-creator.mjs bim import ~/Downloads/example.FCStd --id example
    node apps/cad-creator/bin/agentsam-cad-creator.mjs bim list
    node apps/cad-creator/bin/agentsam-cad-creator.mjs bim verify

The library defaults to ~/.agentsam/cad/bim-starters/ID/; set AGENTSAM_CAD_BIM_LIBRARY to choose a different directory. Imports preserve byte-identical source.FCStd, a SHA-256 receipt, the FreeCAD object hierarchy, its original thumbnail, and a derived preview.glb. GLB geometry is tessellated from native FreeCAD solids, with original per-object material colors. The GLB is not the authoritative parametric source. Sketches, feature histories, constraints, drawing annotations and sections remain in .FCStd.

Open the local CAD server and choose **Model → BIM Starters**. Orbit, zoom, select objects, inspect hierarchy, hide/isolate geometry, and open the native source. **Edit working copy in FreeCAD** creates working.FCStd while leaving source.FCStd and the operator's original untouched. After saving changes in FreeCAD, use **Sync 3D after FreeCAD save** to regenerate only the derived preview and object manifest. The equivalent CLI action is bim refresh ID.

Security and limitations: BIM assets are served only through loopback-checked Node routes. Hosted Workers cannot automatically access an operator's local files. Remote editing requires a separately authenticated execution and asset storage authority. CAD Creator does not yet translate the FreeCAD feature history into its inch-based DesignProject schema; 3D preview mesh selection is not equivalent to editing native BIM constraints. No LLM/Docker fallback is silently substituted for real native conversion.

Native runtime: FreeCAD bundled Python is discovered on macOS, or configure AGENTSAM_CAD_FREECAD_PYTHON.
