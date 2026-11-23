# Barndominium Starter — Next-Agent Buildout Runbook

**Source of truth**: production D1 \`inneranimalmedia-business\` → \`studio_templates\`, platform R2 bucket \`cad\`, prefix \`library/bim-starters/barndominium/v1.1/owner-review/\`. Do not use Google Drive. Do not hardcode DreamHouse, this kit, or any user's project as a runtime preset.

**Current state**: v1.1 is an interactive owner-review **HTML Space**, not a parametric model or permit-ready drawing set. The verified ZIP contains its standalone HTML, README, CSV issue/room/systems registers and delivery manifest. The archive is 184,774 bytes, SHA-256 \`fc1acabd19277de9ae4672c5f07d3b93374002691d185ce29f350aec32bc91b6\`. Always retrieve by catalog R2 reference and verify bytes. The template record for the Space can be active as a review/presentation; the native BIM candidate remains draft until verified.

## Immediate next-agent execution

1. Query \`studio_templates\` for \`SAM-SPACE-BARNDOMINIUM-V11\` and \`SAM-BIM-BARNDOMINIUM-STARTER\`; resolve \`payload_bucket_id\` → \`r2_buckets\`. Read the uploaded \`manifest.json\`, \`review/issue-register.csv\`, \`review/room-schedule.csv\` and \`review/systems-coordination.csv\` directly from the existing \`cad\` bucket. Download and check the ZIP SHA-256. Avoid a new registry, app, table, bucket, viewer, or BIM editor.
2. Open the 16-sheet owner-review Space. Preserve the cover/concept, original input provenance, 36-item build sequence and 17 allowance categories. Treat all drawn dimensions and notes as **unverified schematic assumptions** until checked.
3. Create a traceable design decision register. The source issue register has 18 open RFIs, including site, soils, loading, floor-area coordination, opening counts, roof geometry, MEP, permitting, and native BIM. Every unconfirmed setting must be \`TBD\` with an owner/reviewer, not an invented engineered value.
4. Build **one editable native project** under the existing CAD project/storage contracts using FreeCAD/parametric source and export IFC4. The existing CAD runtime and its authorized execution host perform builds; Cloudflare Worker does not execute FreeCAD itself. Keep R2 stock immutable and create account-owned working copies.
5. Generate a live, traceable **model-derived** set of drawings, schedules and quantity takeoffs. Update the owner-review Space with those verified outputs, not duplicated hardcoded measurements.
6. Publish native BIM version \`v1\` to a new immutable R2 prefix only after all native exports and QA gates pass. Then promote the draft BIM registry row to \`active\` and set the real \`freecad.bim\` renderer/entrypoint. Do not promote on the strength of HTML/SVG/GLB pictures alone.

## Geometry, program and assumptions to reconcile

The concept declares a 72 ft × 32 ft living block = 2,304 SF and a 38 ft × 42 ft garage/shop = 1,596 SF, totaling **3,900 SF enclosed gross**; 60 ft × 8 ft front porch (480 SF) and 24 ft × 10 ft rear patio (240 SF) are additional covered/outdoor areas. The 20 schematic spatial rectangles in \`room-schedule.csv\` represent 17 living/service spaces, garage, porch and patio; **three interior/hall/closet rectangles lack annotated dimensions**. Some conceptual geometry overlaps/notches the illustrated footprint; reconcile gross enclosed area, net room areas, wall thickness, circulation and usable clearances rather than assuming rectangles form a construction plan.

Confirm the actual parcel, site survey and georeferencing, north/orientation, finished floor elevation, flood and wind exposures, setbacks, utilities, accessibility/egress obligations, building-height limits and roof drainage with appropriate licensed reviewers. Do not apply invented local code editions or structural member sizes.

## Required native building assemblies

### A. Site and foundation
- Survey polygon, boundaries, building setbacks, drive access, garage approach, grading slopes, stormwater and drainage, north, levels and georeference.
- Footprint and finished-floor datum for *both* living and garage blocks; front porch/patio elevations and transitions.
- Foundation \`IfcFooting\`, \`IfcSlab\`, thickened edges/grade beams/footings, isolation joints, reinforcement zones, anchors, slab penetrations and vapor/radon/insulation details as specified by engineer.
- Schedule element IDs, quantities, material takeoff, design source and unresolved geotechnical inputs.

### B. Primary structural frame
- One coherent building grid with stable GUIDs. Structural columns, beams, lintels, braces, floor/roof support members, shop opening frames, trusses and purlins.
- Complete vertical and lateral load paths through the large garage overhead-door openings and roof transitions; track proposed spans and size placeholders separately from engineer-approved sizes.
- Connections, bracing, uplift anchors, wind/seismic/flood assumptions, engineering references and shop fabrication/erection coordination.
- Independent structural engineer review gate before any structural schedule is marked approved.

### C. Exterior and interior walls
- Model **every wall as actual geometry**, not presentation strokes: exterior finish, weather/air barrier, sheathing, structural frame, insulation, interior layer, material thickness, height, base and top constraints and IFC classification.
- Assign stable \`WALL-...\` IDs and wall types (\`EW\`, \`IW\`, rated/garage separation, wet/service walls); include parapet/soffit/roof intersections.
- Interior partitions room-by-room including wet-wall chases, cabinetry backing, pocket/double-door clearance, closets, mudroom, laundry, utility spine, garage firewall/separation where applicable.
- Coordinate intersections and wall joins; derive actual net/gross wall areas and material quantities from modeled geometry.

### D. Doors, windows and rough openings
- Every door and window must be a modeled wall opening with explicit link to parent wall and room(s), elevation, sill/head, rough opening, handing, swing, frame, hardware, threshold and occupancy/security/energy/egress attributes.
- Account for the concept's **three overhead garage doors** and reconcile all other doors/windows against the 16-sheet source. The review register notes provisional six door marks and five window types, **not verified quantities**.
- Schedule IDs \`D-###\`, \`W-###\`, \`OH-###\`, width/height, rough opening, material/glazing, finish, fire/egress/safety requirements and supplier selection; elevations/sections must match model.

### E. Roof and envelope
- Model actual roof planes, framing members/trusses, ridge/hip/valley conditions, slope transitions across garage/living, rafters/purlins/decking/underlayment/roof finish, edge/flashing/soffit/fascia, gutters and downspouts.
- Model overhangs, penetrations and drainage destinations, identify wall/roof moisture and thermal continuity and attic/ceiling assemblies.
- Resolve roof form and spans with structural and roofing specialists. No invented pitch or engineered truss sizing.
- Produce roof plan, framing plan, roof sections, roof element schedule and area takeoff.

### F. Interiors, finishes and coordinated fixtures
- Each named space: room boundaries from actual walls, floor-to-finish ceiling height, area, floor/wall/ceiling material types, base/trim, paint, lighting, receptacles, controls, HVAC, required doors/windows and furnishing clearances.
- Fully develop kitchen: walls, pantry, cabinetry, countertops, island, appliances, fixtures, plumbing/electrical rough-ins and elevations with manufacturer/owner selection status.
- Master bath, second bath and laundry/mudroom: fixture clearances, wet-area waterproofing, shower/tub, vanities, drains, exhaust, access panels and verified elevations.
- Bedrooms, flex/office, great room, dining, closets/storage and utility spine: full partitions, openings, ceiling/lighting plans, built-ins and selected furniture/equipment footprints.
- Garage/shop: overhead doors, service access, storage, vehicle clearances, slab design, fire separation, electrical/lighting/ventilation needs.
- Keep owner-selected materials separate from placeholder design allowances; provide finish, hardware, millwork, equipment and furniture schedules.

### G. Coordinated MEP and service routes
- Electrical: service sizing based on engineer/electrician load calculation; panel and circuit schedules; outlets, switches, luminaires, low voltage/data, smoke/CO, grounding, dedicated equipment, EV/shop circuits if required.
- Plumbing: incoming service, DWV/vents, fixtures, water heating, pressure/flow, cleanouts, under-slab sleeves and coordinated riser/isometric schedules.
- HVAC: room-by-room calculated loads, units/air handlers or ductless heads, distribution/returns/fresh air, exhaust, outdoor unit pads, refrigeration/condensate paths and thermostat controls.
- Reserve explicit coordination clearance and true 3D MEP geometry. Report clashes at wall/framing/roof/slab penetrations; unselected system sizes remain TBD.

## Schedules — all link to native model element GUIDs

Generate and keep synchronized (machine-readable CSV/JSON + printable schedules):
- **Space/room schedule**: ID, room, level, dimensions, gross/net SF, volume, ceiling height, floor/wall/ceiling finishes and occupant requirements.
- **Wall assembly schedule**: wall ID/type, finish layers, R-values if verified, wall height/length, opening links, rating requirements, source approvals and quantities.
- **Window/door/overhead-door schedule**: dimensions, marks, type, glazing, rough opening, U-values if supplied, sill/head/handing, hardware, manufacturer and installed count.
- **Structural frame schedule**: grid, footing/slab, columns/posts, beams, headers, bracing, truss/purlins, connections, engineered spans and hold-downs.
- **Roof schedule**: plane IDs, slope, orientation, covering, insulation/decking, drainage, flashing/gutters, area, penetration and truss linkage.
- **Finish and fixture schedules**: room-linked paint, flooring, tile, trim, millwork, countertops, appliances, plumbing fixtures, lighting, accessibility clearances.
- **MEP schedules**: circuit/panel, fixture, plumbing/equipment, HVAC/ventilation, devices, piping and penetrations tied to GUID and design status.
- **Quantities and procurement**: classified model-derived counts/length/area/volume, units and waste-factor assumptions, cost allowances versus bids, lead times, owner sign-off and revision ID.
- **Sheet index & revision matrix**: drawing ID ↔ model revision, author, checker, issued-for status, changed elements, remaining RFI.

Every schedule gets explicit \`modeled\`, \`estimated\`, \`unverified\`, or \`approved\` status; never assert a model-derived total from a sketch.

## Required sheet/report set

Site/grading & utilities; code/program/area sheets; dimensioned floor plan; reflected ceiling plan; doors/windows + equipment; four exterior elevations; building longitudinal/transverse sections; wall type details; foundation and slab design references; structural and roof framing; roof/ventilation/drainage; plumbing/DWV/isometrics; electrical lighting/power/panel; HVAC/ventilation; kitchen/bath/utility elevations; full interior finish and equipment schedules; materials/takeoffs; owner RFIs; revision/QA receipts. Use sheet IDs as defined in the project and preserve owner-review history.

## Native data/QA and acceptance gates

1. Save original owner-review Space intact and separately save parametric \`source.FCStd\`; confirm an *editable* hierarchy (real walls, slabs, openings, roof, beams, columns, spaces). GLB is only the **preview**.
2. Export IFC4 and independently round-trip check shape count, building storey, element classifications, units, placement, GUID stability, opening/door/window relationships and material assignments. Add GLB for browser preview and optional DXF/SVG/PDF for drawings.
3. Validate wall/roof joins and slab extents; no unhosted windows/doors, rogue duplicate elements, unbounded spaces, unexplained area mismatch, egress/access/clearance issues or critical MEP/structure clashes. Publish an issue list rather than pretending all coordination has passed.
4. Measure actual design quantities and compare against room/door/window/roof/wall schedules; preserve discrepancy reports. Require owner signoff and separate structural/MEP/code checks where needed.
5. Native deliverable \`package.zip\` includes \`source.FCStd\`, \`model.ifc\`, \`preview.glb\`, \`drawings/*.pdf\`, \`schedules/*.csv\`, \`qa/*.json\`, \`README.md\`, \`manifest.json\`. Include SHA256, file size, source lineage, generated/approved dates and unresolved blockers.
6. New stock release goes to \`cad/library/bim-starters/barndominium/v1/\` (not overwrite v1.1 owner-review evidence). Upload source/derived/previews, verify R2 readbacks, write manifest LAST, then switch only the existing draft \`bim_starter\` registry row to active.
7. Chat artifact delivery uses existing \`agentsam_agent_run\` / \`agentsam_workflow_runs\` and \`agentsam_artifacts\`, with existing Workbench/Side Stage viewers; real job states only. Show artifact card, one current thumbnail, verified ZIP download, and access-controlled project action. Do not build another artifact manager.

## First review milestone

**Before generating building members**, present an owner-ready design-development package containing corrected exterior footprint, room adjacency/area, door/window opening map, wall type list, roof concept, draft structural grid, wet/service spine and interior material directions. List exact decisions awaiting owner approval and specialist engineering. Then build the parametric project according to those approved decisions. The BIM is not complete until model, schedules, coordinated interiors/exteriors and native round-trip QA all agree.
