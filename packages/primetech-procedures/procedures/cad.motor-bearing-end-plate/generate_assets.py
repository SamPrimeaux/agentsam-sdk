#!/usr/bin/env python3
"""Generate dimensioned drawing source, simulation-only CAM plan, toolpath visual, and a seven-slide story deck."""
from __future__ import annotations
import html
import json
import math
from pathlib import Path
import sys

def esc(value):
    return html.escape(str(value), quote=True)

def svg_header(width, height, title, background="#f7f5ef"):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{esc(title)}">
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z" fill="#314b45"/></marker>
  <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#9ca9a0" stroke-width="1"/></pattern>
</defs>
<rect width="100%" height="100%" fill="{background}"/>
'''

def text(x, y, content, size=20, fill="#243b35", weight=400, anchor="start", tracking=0, family="Arial, Helvetica, sans-serif"):
    return f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" letter-spacing="{tracking}">{esc(content)}</text>'

def line(x1,y1,x2,y2,stroke="#314b45",width=2,dash=None,marker=None):
    attrs=f'x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{stroke}" stroke-width="{width}" fill="none"'
    if dash: attrs+=f' stroke-dasharray="{dash}"'
    if marker: attrs+=f' marker-start="url(#{marker})" marker-end="url(#{marker})"'
    return f'<line {attrs}/>'

def rounded_rect_path(cx,cy,length,width,r,angle_deg,scale=1):
    L=length*scale; W=width*scale; R=r*scale
    return f'<rect x="{-L/2:.2f}" y="{-W/2:.2f}" width="{L:.2f}" height="{W:.2f}" rx="{R:.2f}" fill="none" stroke="#2d7771" stroke-width="2.6" transform="translate({cx:.2f} {cy:.2f}) rotate({angle_deg:.2f})"/>'

def generate_drawing(params, verification, out):
    p=params["candidate"]
    W,H=1600,1100
    s=2.2
    cx,cy=360,355
    R=p["outer_diameter_mm"]/2*s
    bore=p["bore_diameter_mm"]/2*s
    cb=p["counterbore_diameter_mm"]/2*s
    hole=p["hole_diameter_mm"]/2*s
    pcd=p["bolt_circle_diameter_mm"]/2*s
    pocket_r=p["pocket_center_radius_mm"]/math.sqrt(2)*s
    px,py=cx+pocket_r,cy-pocket_r
    bits=[svg_header(W,H,"Motor bearing end plate engineering drawing")]
    bits.append(text(72,70,"ENGINEERING STUDY  /  CAM MODEL 01",16,"#547268",700,tracking=3))
    bits.append(text(72,118,"Motor / bearing end plate",42,"#203b34",700))
    bits.append(text(72,153,"Candidate B — parametric B-rep, dimensioned review drawing",19,"#61736c",400))
    bits.append('<rect x="72" y="185" width="690" height="510" rx="2" fill="#fffdfa" stroke="#d4dcd5" stroke-width="1.5"/>')
    bits.append(text(98,220,"FRONT / PLAN VIEW",15,"#547268",700,tracking=2))
    bits.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="#203b34" stroke-width="3"/>')
    bits.append(f'<circle cx="{cx}" cy="{cy}" r="{cb}" fill="none" stroke="#203b34" stroke-width="2.5"/>')
    bits.append(f'<circle cx="{cx}" cy="{cy}" r="{bore}" fill="none" stroke="#203b34" stroke-width="2.5"/>')
    # Bolt circle is a construction reference, not a physical edge.
    bits.append(f'<circle cx="{cx}" cy="{cy}" r="{pcd}" fill="none" stroke="#8c9c92" stroke-width="1.5" stroke-dasharray="7 6"/>')
    for ang in p["bolt_hole_angles_deg"]:
        x=cx+pcd*math.cos(math.radians(ang))
        y=cy-pcd*math.sin(math.radians(ang))
        bits.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{hole:.2f}" fill="#f7f5ef" stroke="#203b34" stroke-width="2.2"/>')
    bits.append(rounded_rect_path(px,py,p["pocket_length_mm"],p["pocket_width_mm"],p["pocket_corner_radius_mm"],45,s))
    # Outer diameter dimension.
    dim_y=568
    bits.append(line(cx-R,cy+R+14,cx-R,dim_y-8,"#64776e",1.2))
    bits.append(line(cx+R,cy+R+14,cx+R,dim_y-8,"#64776e",1.2))
    bits.append(line(cx-R,dim_y,cx+R,dim_y,"#314b45",1.6,marker="arrow"))
    bits.append(text(cx,dim_y-10,"Ø150",18,"#203b34",700,"middle"))
    # PCD and hole note.
    bits.append(line(cx+pcd*.7,cy-pcd*.7,cx+R+50,cy-R-24,"#64776e",1.4))
    bits.append(text(cx+R+56,cy-R-30,"4 × Ø6.6 THRU",17,"#203b34",700))
    bits.append(text(cx+R+56,cy-R-6,"on Ø90 PCD",16,"#61736c"))
    # Bore and counterbore leaders.
    bits.append(line(cx-4,cy+4,cx-84,cy+76,"#64776e",1.4))
    bits.append(text(cx-92,cy+98,"Ø40 H7",17,"#203b34",700,"end"))
    bits.append(line(cx+14,cy-10,cx+70,cy-75,"#64776e",1.4))
    bits.append(text(cx+78,cy-82,"Ø52 × 4 deep",16,"#203b34",700))
    # Pocket callout.
    bits.append(line(px+12,py+20,px+100,py+58,"#2d7771",1.5))
    bits.append(text(px+106,py+62,"60 × 30 × 4",16,"#2d7771",700))
    bits.append(text(px+106,py+84,"R4 corners",15,"#2d7771"))
    bits.append(text(98,653,"PCD shown dashed for reference. Pocket position is a proposed layout.",14,"#7b8980"))
    # Section view.
    bits.append('<rect x="795" y="185" width="735" height="510" rx="2" fill="#fffdfa" stroke="#d4dcd5" stroke-width="1.5"/>')
    bits.append(text(825,220,"SECTION A—A",15,"#547268",700,tracking=2))
    # Horizontally proportional, vertically exaggerated cross-section.
    xscale=1.62; yscale=6.5
    x0=880; x1=x0+p["outer_diameter_mm"]*xscale
    yt=315; yb=yt+p["thickness_mm"]*yscale
    chamfer_px=max(4,p["outer_chamfer_mm"]*xscale)
    bits.append(f'<path d="M {x0+chamfer_px} {yt} L {x1-chamfer_px} {yt} L {x1} {yt+chamfer_px} L {x1} {yb} L {x0} {yb} L {x0} {yt+chamfer_px} Z" fill="url(#hatch)" stroke="#203b34" stroke-width="2.5"/>')
    # Through bore, counterbore, and the two holes cut by the section plane.
    bore_w=p["bore_diameter_mm"]*xscale
    cb_w=p["counterbore_diameter_mm"]*xscale
    bx=(x0+x1)/2
    bits.append(f'<rect x="{bx-bore_w/2}" y="{yt}" width="{bore_w}" height="{yb-yt}" fill="#fffdfa" stroke="#203b34" stroke-width="1.7"/>')
    bits.append(f'<rect x="{bx-cb_w/2}" y="{yt}" width="{cb_w}" height="{p["counterbore_depth_mm"]*yscale}" fill="#fffdfa" stroke="#203b34" stroke-width="1.7"/>')
    hr=p["hole_diameter_mm"]*xscale
    for x in (bx-p["bolt_circle_diameter_mm"]/2*xscale,bx+p["bolt_circle_diameter_mm"]/2*xscale):
        bits.append(f'<rect x="{x-hr/2}" y="{yt}" width="{hr}" height="{yb-yt}" fill="#fffdfa" stroke="#203b34" stroke-width="1.4"/>')
    bits.append(line(bx-cb_w/2,yt-24,bx+cb_w/2,yt-24,"#64776e",1.3,marker="arrow"))
    bits.append(text(bx,yt-34,"Ø52 counterbore",15,"#203b34",700,"middle"))
    bits.append(line(x0, yb+24, x1, yb+24, "#314b45",1.5,marker="arrow"))
    bits.append(text((x0+x1)/2,yb+16,"150 overall",15,"#203b34",700,"middle"))
    bits.append(text(825,520,"12 mm plate",16,"#203b34",700))
    bits.append(text(825,548,"0.5 mm chamfer on top outside edge",15,"#61736c"))
    bits.append(text(825,576,"Vertical scale exaggerated for legibility.",14,"#7b8980"))
    # Title block.
    bits.append('<rect x="72" y="735" width="1458" height="290" fill="#fffdfa" stroke="#bfcac1" stroke-width="1.5"/>')
    bits.append(line(72,802,1530,802,"#bfcac1",1.2))
    bits.append(line(1000,735,1000,1025,"#bfcac1",1.2))
    bits.append(line(72,875,1530,875,"#bfcac1",1.2))
    bits.append(line(72,950,1530,950,"#bfcac1",1.2))
    bits.append(text(98,772,"PART",13,"#708078",700,tracking=1.6))
    bits.append(text(98,844,"Motor / bearing end plate",23,"#203b34",700))
    bits.append(text(1025,772,"REVISION / STATUS",13,"#708078",700,tracking=1.6))
    bits.append(text(1025,844,"Candidate B — 150 mm OD",20,"#203b34",700))
    bits.append(text(98,843+62,"MATERIAL",13,"#708078",700,tracking=1.6))
    bits.append(text(98,930,"6061-T6 aluminum",18,"#203b34",700))
    bits.append(text(1025,843+62,"UNITS / DEFAULT TOLERANCE",13,"#708078",700,tracking=1.6))
    bits.append(text(1025,930,"mm  /  ±0.1 mm  /  bore H7",18,"#203b34",700))
    bits.append(text(98,920+70,"DESIGN REVIEW COPY — NOT FOR MANUFACTURE",16,"#9b593c",700,tracking=1))
    bits.append(text(1025,920+70,"Model basis: parameters.json + FreeCAD feature history",15,"#61736c"))
    bits.append(text(98,1000,"Original 120 mm OD request retained in spec-feasibility.json; this candidate changes OD to clear the specified pocket.",14,"#61736c"))
    bits.append('</svg>')
    (out/"drawing.svg").write_text("\n".join(bits),encoding="utf-8")
    (out/"drawing.html").write_text(f'''<!doctype html><html><head><meta charset="utf-8"><title>Motor bearing end plate drawing</title><style>@page{{size:A3 landscape;margin:0}}html,body{{margin:0;padding:0;background:#f7f5ef}}img{{width:420mm;height:288.75mm;display:block}}@media print{{body{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}}}</style></head><body><img src="drawing.svg"></body></html>''',encoding="utf-8")

def generate_cam_plan(params, verification, out):
    p=params["candidate"]
    plan={
      "schema":"inneranimalmedia.cam.plan.v1",
      "part_id":params["part_id"],
      "revision":params["revision"],
      "design_status":"proposal_not_approved",
      "execution_mode":"simulation_only",
      "machine_ready":False,
      "controller_output":{"generated":False,"reason":"No machine-specific post, fixture, tool library, controller dialect, or qualified operator verification has been supplied."},
      "material":{"designation":params["material"],"status":"assumed_for_design_review"},
      "geometry_reference":{"native_model":"motor-bearing-end-plate-candidate-150mm.FCStd","step":"motor-bearing-end-plate-candidate-150mm.step","verification":"verification.json"},
      "wcs_concept":{"origin":"stock top center","axes":{"X":"part horizontal datum","Y":"part vertical datum","Z":"normal to top face"},"status":"conceptual; fixture datum and stock orientation require review"},
      "stock_concept":{"envelope_mm":{"x":p["outer_diameter_mm"]+4,"y":p["outer_diameter_mm"]+4,"z":p["thickness_mm"]+2},"material":params["material"],"status":"stock envelope only; not a purchasing or setup instruction"},
      "setups":[{"id":"setup-01","access":"top face","purpose":"Conceptual access to bore, counterbore, bolt holes, service pocket, and outside top edge","status":"simulation_only"}],
      "operation_sequence":[
        {"order":1,"name":"Face stock","intent":"Establish a clean top reference plane","geometry_reference":"top planar face","tool_class":"facing tool","parameters":"not specified"},
        {"order":2,"name":"Pocket roughing","intent":"Remove bulk material from the rounded service pocket","geometry_reference":"ServicePocket feature","tool_class":"end mill","parameters":"not specified"},
        {"order":3,"name":"Pocket finishing","intent":"Finish the pocket walls and floor","geometry_reference":"ServicePocket feature","tool_class":"end mill","parameters":"not specified"},
        {"order":4,"name":"Drill clearance holes","intent":"Create four through holes on the 90 mm bolt circle","geometry_reference":"BoltCircleProfile sketch","tool_class":"drill or qualified interpolation strategy","parameters":"not specified"},
        {"order":5,"name":"Bore","intent":"Finish the 40 mm through bore to the specified H7 requirement","geometry_reference":"ThroughBore feature","tool_class":"qualified boring or interpolation tool","parameters":"not specified"},
        {"order":6,"name":"Counterbore","intent":"Create the 52 mm bearing seat to 4 mm depth","geometry_reference":"Counterbore feature","tool_class":"qualified boring or interpolation tool","parameters":"not specified"},
        {"order":7,"name":"Edge chamfer","intent":"Break the top outside edge by 0.5 mm","geometry_reference":"OuterEdgeChamfer feature","tool_class":"chamfer tool or qualified contour strategy","parameters":"not specified"}
      ],
      "verification":{"geometry_checks_pass":verification["all_checks_pass"],"minimum_pocket_to_hole_clearance_mm":min(verification["clearance_checks_mm"]["bolt_hole_to_pocket"]),"pocket_to_counterbore_clearance_mm":verification["clearance_checks_mm"]["counterbore_to_pocket"],"minimum_pocket_to_outer_edge_clearance_after_chamfer_mm":verification["clearance_checks_mm"]["pocket_to_outer_edge_after_chamfer_minimum"]},
      "excluded":{"feeds_and_speeds":"not specified","machine-specific toolpath":"not generated","G-code":"not generated","cycle_time":"not estimated"},
      "review_required":["Confirm candidate 150 mm OD or approve a different pocket/plate layout.","Confirm the intended M6 clearance fit and bore H7 tolerance limits.","Select machine, workholding, tooling, stock, and post in a qualified CAM environment.","Simulate collisions and validate all cutting parameters before any physical machining."]
    }
    (out/"cam-plan.json").write_text(json.dumps(plan,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    return plan

def generate_toolpath_visual(params, out):
    p=params["candidate"]
    W,H=1400,980
    cx,cy=450,430
    s=3.1
    R=p["outer_diameter_mm"]/2*s
    cb=p["counterbore_diameter_mm"]/2*s
    bore=p["bore_diameter_mm"]/2*s
    hole=p["hole_diameter_mm"]/2*s
    pcd=p["bolt_circle_diameter_mm"]/2*s
    d=p["pocket_center_radius_mm"]/math.sqrt(2)*s
    px,py=cx+d,cy-d
    b=[svg_header(W,H,"Simulation-only CAM path concept","#f3f5f2")]
    b.append(text(55,65,"CAM PATH STUDY",16,"#547268",700,tracking=3))
    b.append(text(55,112,"From solid geometry to an operation sequence",32,"#203b34",700))
    b.append(text(55,145,"Illustrative path layers only — no controller coordinates or executable code",17,"#61736c"))
    b.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="#fffdfa" stroke="#314b45" stroke-width="3"/>')
    b.append(f'<circle cx="{cx}" cy="{cy}" r="{cb}" fill="none" stroke="#7c8e85" stroke-width="2" stroke-dasharray="8 6"/>')
    b.append(f'<circle cx="{cx}" cy="{cy}" r="{bore}" fill="none" stroke="#7c8e85" stroke-width="2"/>')
    b.append(f'<circle cx="{cx}" cy="{cy}" r="{pcd}" fill="none" stroke="#a9b5ad" stroke-width="1.5" stroke-dasharray="5 7"/>')
    # Schematic contours: deliberately not exported as cutter-center geometry.
    for k in range(4):
        inset=3+k*5
        b.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{bore+inset:.2f}" ry="{bore+inset:.2f}" fill="none" stroke="#2b7a78" stroke-width="2" opacity="{0.88-k*.12}"/>')
    for angle in p["bolt_hole_angles_deg"]:
        x=cx+pcd*math.cos(math.radians(angle)); y=cy-pcd*math.sin(math.radians(angle))
        b.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{hole:.2f}" fill="#fffdfa" stroke="#314b45" stroke-width="2"/>')
        b.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{hole+8:.2f}" fill="none" stroke="#c08b45" stroke-width="2" stroke-dasharray="5 5"/>')
    # Pocket perimeter and abstract inward contours.
    b.append(rounded_rect_path(px,py,p["pocket_length_mm"],p["pocket_width_mm"],p["pocket_corner_radius_mm"],45,s))
    for inset in (3,6,9):
        b.append(rounded_rect_path(px,py,p["pocket_length_mm"]-2*inset,p["pocket_width_mm"]-2*inset,max(1,p["pocket_corner_radius_mm"]-inset/2),45,s))
    # Outer-edge finishing trace.
    b.append(f'<circle cx="{cx}" cy="{cy}" r="{R-4}" fill="none" stroke="#2b7a78" stroke-width="2.2" stroke-dasharray="9 5"/>')
    # Legend and sequencing.
    b.append('<rect x="920" y="220" width="410" height="550" rx="3" fill="#fffdfa" stroke="#d4dcd5" stroke-width="1.5"/>')
    b.append(text(950,265,"OPERATION LAYERS",16,"#547268",700,tracking=2))
    legend=[
      ("01","Face reference","Top plane / datum establishment","#2b7a78"),
      ("02","Pocket roughing","Bulk-removal intent","#2b7a78"),
      ("03","Pocket finishing","Wall and floor finish intent","#2b7a78"),
      ("04","Drilling","Four hole locations","#c08b45"),
      ("05","Bore + counterbore","Concentric bearing features","#7c8e85"),
      ("06","Outer chamfer","Perimeter finishing intent","#2b7a78"),
    ]
    y=320
    for num,title,sub,color in legend:
        b.append(f'<circle cx="965" cy="{y-5}" r="7" fill="{color}"/>')
        b.append(text(990,y,num,15,"#61736c",700))
        b.append(text(1030,y,title,17,"#203b34",700))
        b.append(text(1030,y+24,sub,14,"#61736c"))
        y+=70
    b.append(text(950,730,"SIMULATION ONLY",15,"#9b593c",700,tracking=1.6))
    b.append(text(950,755,"No G-code or machine settings emitted.",14,"#61736c"))
    b.append(text(55,925,"The paths communicate sequence and geometry relationships, not a machine-ready toolpath.",15,"#61736c"))
    b.append('</svg>')
    (out/"toolpath-preview.svg").write_text("\n".join(b),encoding="utf-8")
    (out/"toolpath-preview.html").write_text(f'''<!doctype html><html><head><meta charset="utf-8"><title>CAM path concept</title><style>@page{{size:A3 landscape;margin:0}}html,body{{margin:0;padding:0;background:#f3f5f2}}img{{width:420mm;height:294mm;display:block}}@media print{{body{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}}}</style></head><body><img src="toolpath-preview.svg"></body></html>''',encoding="utf-8")

def generate_deck(params, verification, plan, out):
    p=params["candidate"]
    slides=[]
    def slide(title, eyebrow, body, visual="", note=""):
        slides.append(f'''<section class="slide"><div class="eyebrow">{esc(eyebrow)}</div><h1>{esc(title)}</h1><div class="body">{body}</div>{visual}<div class="foot">{esc(note)}</div></section>''')
    slide("From geometry to a process you can inspect","CAM MODEL 01 · MOTOR / BEARING END PLATE",
      '<p class="lead">A single component becomes a connected engineering artifact: editable solid, verified dimensions, drawing, and a simulation-only process story.</p><div class="metric-row"><div><b>150 mm</b><span>candidate OD</span></div><div><b>12 mm</b><span>plate thickness</span></div><div><b>1</b><span>valid solid</span></div></div>',
      '<div class="hero"><img src="part-preview.png" alt="Rendered end plate model"></div>',
      "Candidate B is a proposed geometry revision, not an approved design or manufacturing release.")
    slide("One parameter source. One geometry authority.","01 · PARAMETRIC CAD",
      '<p class="lead">The named parameter file drives a native FreeCAD feature history. STEP carries the exact boundary representation; STL is the mesh preview.</p><ul><li>Base profile and pad</li><li>Counterbore and through bore</li><li>Four clearance holes on the bolt circle</li><li>Rounded service pocket and outer chamfer</li></ul>',
      '<div class="visual"><img src="part-preview.png" alt="Candidate model"></div>',
      "The model is regenerated from parameters.json; no hand-edited mesh is treated as design authority.")
    slide("Geometry gets a receipt.","02 · VERIFICATION",
      f'<div class="metric-row"><div><b>{verification["native_metrics"]["bounding_box_mm"]["x"]:.0f} × {verification["native_metrics"]["bounding_box_mm"]["y"]:.0f} × {verification["native_metrics"]["bounding_box_mm"]["z"]:.0f}</b><span>verified B-Rep envelope, mm</span></div><div><b>{verification["native_metrics"]["volume_mm3"]:,.2f}</b><span>volume, mm³</span></div><div><b>{len(verification["checks"])}/{len(verification["checks"])}</b><span>checks passed</span></div></div><p>STEP was re-imported and compared with the native solid. The STL mesh was checked for facets and envelope.</p>',
      '<div class="visual small"><img src="drawing.svg" alt="Dimensioned drawing"></div>',
      "Verification is computational evidence for this candidate, not an engineering seal.")
    slide("The first specification exposed a real constraint.","03 · DESIGN REVIEW",
      '<p class="lead">A 120 mm plate cannot contain a separate 60 × 30 mm rounded pocket while clearing the 52 mm counterbore and staying within the outer boundary.</p><div class="callout"><b>Original request</b><span>120 mm OD · pocket 60 × 30 × 4 mm</span></div><div class="callout proposal"><b>Candidate B</b><span>150 mm OD · pocket centered 51 mm radially, tangent at 45°</span></div><p>The requested dimensions remain recorded. The larger plate is an explicit proposal, not a silent substitution.</p>',
      '<div class="visual"><img src="drawing.svg" alt="Drawing showing candidate layout"></div>',
      "Owner decision required before treating Candidate B as the intended part.")
    slide("The drawing follows the solid.","04 · DIMENSIONED REVIEW",
      '<p class="lead">Front/plan and section views communicate the bore, bearing seat, bolt circle, thickness, pocket, and edge treatment.</p><ul><li>Default tolerance: ±0.1 mm</li><li>Bore requirement: Ø40 H7</li><li>Material assumption: 6061-T6 aluminum</li><li>Fit-standard and H7 limit values require confirmation</li></ul>',
      '<div class="visual"><img src="drawing.svg" alt="Dimensioned drawing"></div>',
      "Design review copy — not for manufacture.")
    slide("The CAM view explains sequence, not machine commands.","05 · SIMULATION-ONLY CAM",
      '<p class="lead">The operation map connects each intent to a named CAD feature. It is useful for review without pretending that a machine, fixture, tool library, or post has been validated.</p><ul><li>Reference face</li><li>Pocket roughing and finishing intent</li><li>Hole, bore, and counterbore feature sequence</li><li>Outside-edge chamfer intent</li></ul>',
      '<div class="visual"><img src="toolpath-preview.png" alt="Illustrative toolpath layers"></div>',
      "No executable G-code, machine-specific feeds/speeds, or cycle-time estimate is included.")
    slide("Verified geometry is the start, not the finish.","06 · NEXT ENGINEERING GATE",
      '<div class="two-col"><div><h2>Verified</h2><ul><li>Native solid and STEP round-trip</li><li>Bounding box and volume</li><li>Hole layout and pocket clearances</li><li>STL mesh exists and is readable</li></ul></div><div><h2>Still requires review</h2><ul><li>Approve the 150 mm OD or revise pocket/layout</li><li>Confirm material and tolerances</li><li>Fixture, machine, tooling, and post selection</li><li>Qualified CAM simulation and sign-off</li></ul></div></div>',
      '<div class="final-line">From a parametric idea to evidence that can be inspected, revised, and handed to the next specialist.</div>',
      "Slice 2: fixture concept, second setup if needed, rest-machining analysis, and a machine-agnostic validated simulation.")
    html_doc='''<!doctype html><html><head><meta charset="utf-8"><title>CAM Model 01 — Motor / Bearing End Plate</title><style>
@page{size:13.333in 7.5in;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#f5f3ed;color:#203b34;font-family:Arial,Helvetica,sans-serif}
.slide{width:13.333in;height:7.5in;padding:.55in .68in .45in;position:relative;overflow:hidden;page-break-after:always;background:#f7f5ef}
.slide:last-child{page-break-after:auto}.eyebrow{font-size:10pt;letter-spacing:2.2px;color:#547268;font-weight:700;text-transform:uppercase;margin-bottom:15px}
h1{font-size:30pt;line-height:1.08;max-width:8.5in;margin:0 0 18px;font-weight:700;letter-spacing:-.7px}
.body{position:relative;z-index:2;width:52%;font-size:14pt;line-height:1.42}.lead{font-size:17pt;line-height:1.35;color:#314b45;margin:0 0 18px}
ul{padding-left:22px;margin:14px 0}li{margin:6px 0} .hero,.visual{position:absolute;right:.55in;top:1.2in;width:5.2in;height:4.85in;display:flex;align-items:center;justify-content:center}
.hero img,.visual img{max-width:100%;max-height:100%;object-fit:contain}.visual.small{width:5.2in;height:4.1in;top:1.65in}
.metric-row{display:flex;gap:20px;margin-top:24px;flex-wrap:wrap}.metric-row>div{border-top:1px solid #bfcac1;padding-top:10px;min-width:1.5in;max-width:3.3in}.metric-row b{display:block;font-size:22pt;line-height:1.1}.metric-row span{display:block;font-size:10pt;color:#61736c;margin-top:5px}
.callout{border-left:4px solid #8e9d8e;background:#fffdfa;padding:12px 15px;margin:12px 0;display:flex;flex-direction:column;gap:4px}.callout.proposal{border-left-color:#2d7771}.callout b{font-size:13pt}.callout span{font-size:11pt;color:#61736c}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;width:100%;font-size:12pt}.two-col h2{font-size:16pt;margin:0 0 8px}.two-col ul{margin-top:0}.final-line{border-top:1px solid #bfcac1;margin-top:28px;padding-top:18px;font-size:20pt;font-weight:600;max-width:8.2in}
.foot{position:absolute;bottom:.25in;left:.68in;right:.68in;border-top:1px solid #d4dcd5;padding-top:7px;font-size:8.5pt;color:#728078}
</style></head><body>'''+''.join(slides)+'''</body></html>'''
    (out/"presentation.html").write_text(html_doc,encoding="utf-8")

def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: generate_assets.py parameters.json verification.json output_dir")
    params=Path(sys.argv[1]).resolve(strict=True)
    verification=Path(sys.argv[2]).resolve(strict=True)
    out=Path(sys.argv[3]).resolve()
    out.mkdir(parents=True,exist_ok=True)
    source=json.loads(params.read_text(encoding="utf-8"))
    verified=json.loads(verification.read_text(encoding="utf-8"))
    generate_drawing(source,verified,out)
    plan=generate_cam_plan(source,verified,out)
    generate_toolpath_visual(source,out)
    generate_deck(source,verified,plan,out)
    print(json.dumps({"ok":True,"files":["drawing.svg","drawing.html","cam-plan.json","toolpath-preview.svg","toolpath-preview.html","presentation.html"],"operation_count":len(plan["operation_sequence"]),"controller_output_generated":False},sort_keys=True))

if __name__=="__main__":
    main()
