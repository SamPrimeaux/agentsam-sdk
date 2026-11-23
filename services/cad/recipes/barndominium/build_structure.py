"""Build an owner-review Barndominium structural BIM from its published geometry.

The geometry is reproducible, and modeled in FreeCAD solids with element IDs.
No sizes/loads/engineering not present in the input are presented as approved.
Use FreeCAD's own Python with FreeCAD and IfcOpenShell on PYTHONPATH.

Usage:
    python build_structure.py /path/to/review/room-schedule.csv /path/to/output

Output: native FCStd, IFC4, OBJ, MTL, schedules, review assumptions and QA evidence.
"""
from __future__ import annotations

import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from importlib import import_module
from pathlib import Path
from typing import Any, cast

import FreeCAD as App
import Part

FT = 304.8     # internal millimeters
V = App.Vector
OUT_NAME = "Barndominium-Structure-Concept-V2"
PALETTE = {
    "foundation": (0.64, 0.65, 0.64),
    "frame": (0.57, 0.38, 0.22),
    "bracing": (0.83, 0.53, 0.29),
    "exterior": (0.89, 0.86, 0.79),
    "interior": (0.88, 0.86, 0.78),
    "roof": (0.21, 0.25, 0.28),
    "roof-framing": (0.62, 0.43, 0.28),
    "opening": (0.18, 0.22, 0.25),
    "glazing": (0.40, 0.71, 0.83),
    "drainage": (0.40, 0.42, 0.45),
    "flashings": (0.75, 0.77, 0.78),
    "porch": (0.74, 0.55, 0.33),
}
IFC_CLASSES = {
    "foundation":"IfcSlab", "frame":"IfcMember","bracing":"IfcMember",
    "exterior":"IfcWall","interior":"IfcWall","roof":"IfcRoof",
    "roof-framing":"IfcMember","opening":"IfcDoor",
    "glazing":"IfcWindow","drainage":"IfcPipeSegment",
    "flashings":"IfcCovering","porch":"IfcMember"
}
MODEL = []
OPENINGS = []
ISSUES = []
ROOMS = []
DOC: Any = None
GROUPS = {}

def mm(x):
    return float(x)*FT

def vft(x,y,z):
    return V(mm(x),mm(y),mm(z))

def box(x,y,z,dx,dy,dz):
    if min(dx,dy,dz) <= 0: raise ValueError("invalid box dimensions")
    return Part.makeBox(mm(dx),mm(dy),mm(dz),vft(x,y,z))

def rod(p1,p2,width=.2,depth=.25):
    a,b=vft(*p1),vft(*p2)
    tangent=b-a
    if tangent.Length < 1: raise ValueError("zero length member")
    shape=Part.makeBox(tangent.Length,mm(width),mm(depth),V(0,-mm(width)/2,-mm(depth)/2))
    shape.Placement=App.Placement(a,App.Rotation(V(1,0,0),tangent))
    return shape

def polygon_prism(points,vertical_thickness=.12):
    wire=Part.makePolygon([vft(*p) for p in points+[points[0]]])
    return Part.Face(wire).extrude(vft(0,0,vertical_thickness))

def issue(id,description,owner):
    ISSUES.append({"id":id,"issue":description,"reviewer":owner,"status":"OPEN"})

def add(code,title,shape,category,ifc_class=None,source="provisional",material="TBD",notes="",parent=None):
    if shape.isNull() or shape.Volume <= 0 or not shape.isValid():
        raise ValueError("invalid non-solid element %s" % code)
    obj=DOC.addObject("PartDesign::Feature","Element")
    obj.Label=code+" | "+title
    obj.Shape=shape
    for key,value in {
        "ElementId":code,"IfcClass":ifc_class or IFC_CLASSES[category],
        "SourceStatus":source,"SourceReference":"Barndominium Owner Review v1.1",
        "MaterialSpecification":material,"ReviewNote":notes,
    }.items():
        obj.addProperty("App::PropertyString",key,"BIM metadata")
        setattr(obj,key,str(value))
    GROUPS[category].addObject(obj)
    if obj.ViewObject:
        obj.ViewObject.ShapeColor=PALETTE[category]
        obj.ViewObject.DisplayMode="Flat Lines"
    MODEL.append({
        "id":code,"title":title,"category":category,
        "ifc_class":ifc_class or IFC_CLASSES[category],
        "source_status":source,"material":material,"review_note":notes,
        "volume_m3":round(shape.Volume/1e9,5),
        "bbox_ft":[round(x/FT,3) for x in [
            shape.BoundBox.XMin,shape.BoundBox.YMin,shape.BoundBox.ZMin,
            shape.BoundBox.XMax,shape.BoundBox.YMax,shape.BoundBox.ZMax]],
        "_shape":shape
    })
    return obj

def wall_shape(axis,coordinate,start,end,height=10,thickness=.5,holes=(),base=0):
    """Wall along x or y, centered on fixed coordinate, cut with real void solids."""
    if axis=="x":
        shape=box(start,coordinate-thickness/2,base,end-start,thickness,height)
    else:
        shape=box(coordinate-thickness/2,start,base,thickness,end-start,height)
    for o in holes:
        off=o["at"]
        wide=o["width"]
        sill=o["sill"]
        high=o["height"]
        if off < start or off+wide > end or sill < base or sill+high >= base+height:
            raise ValueError("opening outside wall: "+str(o))
        if axis=="x":
            hole=box(off,coordinate-thickness/2-.1,sill,wide,thickness+.2,high)
        else:
            hole=box(coordinate-thickness/2-.1,off,sill,thickness+.2,wide,high)
        shape=shape.cut(hole)
    return shape

def exterior_wall(name,axis,coord,start,end,height,holes=(),category="exterior",thick=.5):
    wall=wall_shape(axis,coord,start,end,height,thick,holes)
    add(name,"Wall with coordinated opening cuts",wall,category,"IfcWall",
        "concept-outline", "2x6 nominal placeholder" if category=="exterior" else "rated assembly TBD",
        "All openings, fire separation, energy, wind and lateral details require approval")
    for o in holes:
        code=o["id"]
        OPENINGS.append({"id":code,"host":name,"type":o["type"],"axis":axis,"wall_coord_ft":coord,
             "start_ft":o["at"],"width_ft":o["width"],"sill_ft":o["sill"],"height_ft":o["height"],
             "source":o.get("source","provisional"),"status":"REVIEW"})
        at,width,sill,high=o["at"],o["width"],o["sill"],o["height"]
        # Opening sill, frame jambs and header are separately editable elements.
        # These are review geometry, not engineered spans or rated assemblies.
        frame_th=.16 if o["type"]!="overhead" else .25
        if axis=="x":
            left=box(at,coord-.14,sill,frame_th,.28,high)
            right=box(at+width-frame_th,coord-.14,sill,frame_th,.28,high)
            head=box(at,coord-.18,sill+high-.17,width,.36,.17)
            panel=box(at+.12,coord-.08,sill+.08,max(.1,width-.24),.16,max(.1,high-.22))
            glass=box(at+.12,coord-.09,sill+.12,max(.1,width-.24),.18,max(.1,high-.25))
        else:
            left=box(coord-.14,at,sill,.28,frame_th,high)
            right=box(coord-.14,at+width-frame_th,sill,.28,frame_th,high)
            head=box(coord-.18,at,sill+high-.17,.36,width,.17)
            panel=box(coord-.08,at+.12,sill+.08,.16,max(.1,width-.24),max(.1,high-.22))
            glass=box(coord-.09,at+.12,sill+.12,.18,max(.1,width-.24),max(.1,high-.25))
        for suffix,part in [("JAMB-L",left),("JAMB-R",right),("HEAD",head)]:
            add(code+"-"+suffix,"Opening frame "+suffix,part,"frame","IfcMember",
                o.get("source","provisional"),"header / jamb sizing TBD")
        if o["type"] == "window":
            add(code+"-GLASS","Window glazed unit",glass,"glazing","IfcWindow",
                o.get("source","provisional"),"Glazing/egress/thermal specifications TBD")
        else:
            add(code+"-LEAF","Door panel, conceptual",panel,"opening","IfcDoor",
                o.get("source","provisional"),"Rated, wind and opening hardware specifications TBD")
    return name

def o(id,at,width,sill,height,type="window",source="provisional"):
    return {"id":id,"at":at,"width":width,"sill":sill,"height":height,"type":type,"source":source}

def add_foundations():
    add("S-FND-01","Garage slab 38×42 ft",box(0,0,-.5,38,42,.5),"foundation","IfcSlab",
        "source-specified-footprint","Thickness 6 in conceptual", "Thickness and reinforcement not engineered")
    add("S-FND-02","Living slab 72×32 ft",box(38,10,-.5,72,32,.5),"foundation","IfcSlab",
        "source-specified-footprint","Thickness 6 in conceptual", "Thickness and reinforcement not engineered")
    add("S-FND-03","Covered porch slab 60×8 ft",box(44,42,-.35,60,8,.35),"foundation","IfcSlab",
        "source-specified-footprint","Porch slab provisional")
    add("S-FND-04","Rear patio slab 24×10 ft",box(62,0,-.35,24,10,.35),"foundation","IfcSlab",
        "source-specified-footprint","Patio slab provisional")
    # perimeter thickened edges for concave 3,900 SF footprint, no overlap counting.
    edges=[
        ((0,0),(38,0)),((38,0),(38,10)),((38,10),(110,10)),
        ((110,10),(110,42)),((110,42),(0,42)),((0,42),(0,0))
    ]
    for i,(a,b) in enumerate(edges,1):
        if a[0]==b[0]:
            s=box(a[0]-.75,min(a[1],b[1]),-1.5,1.5,abs(a[1]-b[1]),1.0)
        else:
            s=box(min(a[0],b[0]),a[1]-.75,-1.5,abs(a[0]-b[0]),1.5,1.0)
        add(f"S-EDGE-{i:02}","Perimeter slab edge/grade-beam placeholder",s,"foundation","IfcFooting",
            "provisional","Conceptual 18 × 12 in thickened edge; verify soil and slab design")
    for i,x in enumerate([44,56,68,80,92,104],1):
        add(f"S-PORCH-PIER-{i:02}","Covered porch post pier",box(x-.8,49-.8,-2,1.6,1.6,2),"foundation","IfcFooting",
            "provisional","Footing depth/size TBD")
    issue("STR-001","Geotechnical design, seismic/wind/flood criteria and foundation sizing","Geotechnical and structural engineer")

def add_grid():
    g=DOC.addObject("App::DocumentObjectGroup","GridReferences")
    g.Label="BIM reference grid (not geometry for IFC)"
    for axis,coords in [("X",[0,12.7,25.3,38,44,49,65,69,79,94,105,110]),
                        ("Y",[0,10,17,24,30,42,50])]:
        for i,coord in enumerate(coords):
            obj=DOC.addObject("PartDesign::Feature","GridLine")
            obj.Label=f"GRID {axis}-{i+1} | {coord:g} ft"
            obj.addProperty("App::PropertyString","GridAxis","Grid")
            obj.GridAxis=axis
            obj.addProperty("App::PropertyLength","Offset","Grid")
            obj.Offset=mm(coord)
            obj.Shape=Part.makeLine(vft(coord,-3,-.08),vft(coord,54,-.08)) if axis=="X" else Part.makeLine(vft(-3,coord,-.08),vft(113,coord,-.08))
            g.addObject(obj)

def add_walls():
    # Coordinate system follows v1.1 plan: (0,0) garage northwest, y+ to front/south.
    exterior_wall("A-G-WEST","y",0,0,42,14)
    exterior_wall("A-G-NORTH","x",0,0,38,14)
    exterior_wall("A-G-SOUTH","x",42,0,38,14,[
        o("G-01",2,10,0,12,"overhead","source-labeled"),
        o("G-02",14,10,0,12,"overhead","source-labeled"),
        o("G-03",26,10,0,12,"overhead","source-labeled")])
    exterior_wall("A-G-EAST-EXPOSED","y",38,0,10,14)
    exterior_wall("A-L-NORTH","x",10,38,110,10,[
        o("W-NK",53,4,3.2,4,"window"),
        o("D-PATIO",68,7,0,7,"sliding","source-framing-note"),
        o("W-NM",85,4,3,4.5,"window")])
    exterior_wall("A-L-EAST","y",110,10,42,10,[
        o("W-E01",19,4,3,4,"window"),o("W-E02",33,4,3,4,"window")])
    exterior_wall("A-L-SOUTH","x",42,38,110,10,[
        o("W-FLEX",43,4,2.5,5,"window"),
        o("D-ENTRY",54.5,3,0,7,"door","source-framing-note"),
        o("W-GREAT",62,4,3,4.5,"window"),
        o("W-BED2",82,4,3,4.5,"window"),
        o("W-BED3",97,4,3,4.5,"window")])
    exterior_wall("A-G-L-SEPARATION","y",38,10,42,14,[
        o("D-GARAGE-MUDROOM",12,3,0,7,"door","source-room-note")
    ],category="interior",thick=.65)
    issue("STR-002","Garage separation rating, self-closing door, penetrations and garage-to-house load path","Architect / structural / fire reviewer")

    # Separating partitions. Missing exact wall locations are marked provisional;
    # open-plan Kitchen / Dining / Great Room boundaries are deliberately left open.
    partitions=[
        ("P-MUD-KITCHEN","y",49,10,24,[o("D-MUD-KITCHEN",17.5,3,0,7,"door")]),
        ("P-MUD-PANTRY","x",17,38,49,[o("D-PANTRY",44.5,2.5,0,7,"door")]),
        ("P-PANTRY-HALL","y",43.5,17,24,[]),
        ("P-FLEX-GREAT","y",49,24,42,[o("D-FLEX",26,3,0,7,"door")]),
        ("P-MASTER-WEST","y",79,10,24,[o("D-MASTER",20,3,0,7,"door")]),
        ("P-MASTER-EAST","y",94,10,24,[o("D-WIC",13,2.6,0,7,"door")]),
        ("P-WIC-BATH","x",16.5,94,105,[o("D-BATH",98,2.5,0,7,"door")]),
        ("P-BATH2-SPLIT","x",25,94,105,[]),
        ("P-MASTER-HALL","x",24,79,94,[o("D-MASTER-HALL",83,3,0,7,"door")]),
        ("P-HALL-BEDROOMS","x",30,69,105,[
            o("D-BED2-CL",71,2.6,0,7,"door"),
            o("D-BED2",83,2.8,0,7,"door"),
            o("D-BED3",97,2.8,0,7,"door")]),
        ("P-HALL-WEST","y",69,24,30,[]),
        ("P-STORAGE-BED2","y",79,30,42,[]),
        ("P-BED2-CLOSETS","y",90,30,42,[]),
        ("P-CLOSETS-BED3","y",94,30,42,[]),
        ("P-UTILITY","y",105,10,42,[o("D-UTILITY",27,3,0,7,"door")]),
        ("P-BATH2-EAST","y",94,25,30,[o("D-BATH2",26,2.6,0,7,"door")]),
    ]
    for name,axis,coord,start,end,holes in partitions:
        exterior_wall(name,axis,coord,start,end,10,holes,category="interior",thick=.34)
    issue("STR-003","Interior wall layout and door clearances require architectural dimension reconciliation","Owner / architect")
    issue("STR-004","Exterior and bedroom glazing locations/egress sizes are conceptual","Architect / window supplier")

def add_structure():
    # Structural posts are placed at concept grids, not asserted to be adequate.
    posts=[
        ("GARAGE",[(0,0),(12.7,0),(25.3,0),(38,0),
                   (0,42),(12.7,42),(25.3,42),(38,42)],14),
        ("LIVING",[(38,10),(49,10),(69,10),(79,10),(94,10),(110,10),
                   (38,42),(49,42),(69,42),(79,42),(94,42),(110,42)],10),
    ]
    for group,points,h in posts:
        for i,(x,y) in enumerate(points,1):
            add(f"S-POST-{group}-{i:02}","Post / primary column",box(x-.23,y-.23,0,.46,.46,h),
                "frame","IfcColumn","provisional","Column cross-section / steel or timber grade TBD")
    # Load path beams: garage overhead clear spans and bearing line, placement not engineering.
    for i,(p1,p2) in enumerate([
        ((0,0,13.6),(38,0,13.6)),((0,42,13.6),(38,42,13.6)),
        ((38,10,9.6),(110,10,9.6)),((38,42,9.6),(110,42,9.6)),
        ((49,24,9.6),(105,24,9.6))
    ],1):
        add(f"S-BEAM-{i:02}","Bearing / tie beam",rod(p1,p2,.35,.6),"frame","IfcBeam",
            "provisional","Span, material, species and reactions TBD")
    # Real overhead headers above each cut opening.
    for i,at in enumerate([2,14,26],1):
        add(f"S-GHDR-{i:02}","Garage door header above 10-ft clear span",
            box(at-.65,41.55,12,11.3,.8,1.0),
            "frame","IfcBeam","provisional","Engineered garage portal frame required")
    # Directional brace members in otherwise solid perimeter bays.
    for i,(a,b) in enumerate([
        ((.1,1,2),(.1,10,12.4)),((.1,30,2),(.1,40,12.4)),
        ((37.9,1,2),(37.9,9,12.4)),
        ((38,11,2),(47,11,9.4)),((110,11,2),(110,17,9.4)),
        ((38,38,2),(46,38,9.4)),((110,34,2),(110,40,9.4))
    ],1):
        add(f"S-BRACE-{i:02}","Concept lateral diagonal brace",rod(a,b,.18,.22),"bracing",
            "IfcMember","provisional","Wind/lateral restraint engineering REQUIRED")
    issue("STR-005","Verify primary columns, beam sizes, lateral bracing, hurricane clips and wind-uplift load path","Structural engineer")

def add_roof():
    # Living ridge follows the 72-ft long axis to reconcile 10-ft eave
    # plus 6:12 x 16-ft half-span = 18-ft ridge on the source section.
    # Roof plan graphic showing a different ridge orientation remains RFI.
    y0,y_r,y1=10,26,42
    length0,length1=38,110
    add("R-LIV-NORTH","Living roof north 6:12 plane",
        polygon_prism([(36,8,9),(112,8,9),(112,26,18),(36,26,18)],.12),
        "roof","IfcRoof","section-derived","Standing seam over deck; detailing TBD")
    add("R-LIV-SOUTH","Living roof south 6:12 plane",
        polygon_prism([(36,26,18),(112,26,18),(112,44,9),(36,44,9)],.12),
        "roof","IfcRoof","section-derived","Standing seam over deck; detailing TBD")
    # Garage ridge follows 42-ft axis, preserving 3× 12-ft openings and concept 6:12 pitch.
    add("R-GAR-WEST","Garage gable roof west 6:12",
        polygon_prism([(-2,-2,13),(19,-2,23.5),(19,44,23.5),(-2,44,13)],.12),
        "roof","IfcRoof","provisional","Garage eave assumed 14 ft, verify")
    add("R-GAR-EAST","Garage gable roof east 6:12",
        polygon_prism([(19,-2,23.5),(40,-2,13),(40,44,13),(19,44,23.5)],.12),
        "roof","IfcRoof","provisional","Roof intersection/valley must be redesigned")
    # Porch shed 3:12, upper edge 9.2 and outer edge 7.2.
    add("R-PORCH","Porch shed roof 3:12",
        polygon_prism([(44,42,9.2),(104,42,9.2),(104,50,7.2),(44,50,7.2)],.12),
        "roof","IfcRoof","source-pitch","Roof/ledger/ledger attachment verify")
    for i,x in enumerate([44,56,68,80,92,104],1):
        add(f"S-PORCH-POST-{i:02}","Porch post",box(x-.22,48.8,0,.44,.44,7.35),
            "porch","IfcColumn","provisional","Post connection / pier / roof attachment TBD")
    add("S-PORCH-BEAM","Porch outer support beam",rod((44,49,7.35),(104,49,7.35),.33,.45),
        "porch","IfcBeam","provisional","Header span unsupported until engineer designs")
    # Truss frames at 24 in on center, each with bottom chord, two rafters,
    # central vertical and tie braces. Conceptual representation of trusses.
    for i,x in enumerate(range(38,111,2),1):
        stem=f"T-L-{i:03}"
        for suffix,p1,p2 in [
          ("BOTTOM",(x,10,10),(x,42,10)),
          ("RAFTER-N",(x,10,10),(x,26,18)),
          ("RAFTER-S",(x,26,18),(x,42,10)),
          ("WEB-C",(x,26,10),(x,26,18)),
          ("WEB-N",(x,18,10),(x,26,18)),
          ("WEB-S",(x,26,18),(x,34,10)),
        ]:
            add(stem+"-"+suffix,"Living roof truss member",rod(p1,p2,.14,.18),
                "roof-framing","IfcMember","provisional","Truss profile 24 in O.C. concept")
    for i,y in enumerate(range(0,43,2),1):
        stem=f"T-G-{i:03}"
        for suffix,p1,p2 in [
          ("BOTTOM",(0,y,14),(38,y,14)),
          ("RAFTER-W",(0,y,14),(19,y,23.5)),
          ("RAFTER-E",(19,y,23.5),(38,y,14)),
          ("WEB-C",(19,y,14),(19,y,23.5)),
          ("WEB-W",(9.5,y,14),(19,y,23.5)),
          ("WEB-E",(19,y,23.5),(28.5,y,14))
        ]:
            add(stem+"-"+suffix,"Garage roof truss member",rod(p1,p2,.16,.2),
                "roof-framing","IfcMember","provisional","Truss profile 24 in O.C. concept")
    # Purlins / battens crossing truss planes at 4-ft schematic pitch spacing.
    for i,y in enumerate([10,14,18,22,26,30,34,38,42],1):
        z=18-.5*abs(y-26)
        add(f"P-L-{i:02}","Living roof purlin/standing seam support",
            rod((38,y,z),(110,y,z),.14,.17),"roof-framing","IfcMember",
            "provisional","Spacing and deck attachment TBD")
    for i,x in enumerate([0,4,8,12,16,19,22,26,30,34,38],1):
        z=23.5-.5*abs(x-19)
        add(f"P-G-{i:02}","Garage roof purlin",
            rod((x,0,z),(x,42,z),.14,.17),"roof-framing","IfcMember",
            "provisional","Spacing and span TBD")
    # Ridge caps, eave flashing and gutters at actual roof boundaries.
    add("R-CAP-LIVING","Living ridge cap",rod((36,26,18.12),(112,26,18.12),.3,.15),
        "flashings","IfcCovering","provisional","Standing-seam cap detail TBD")
    add("R-CAP-GARAGE","Garage ridge cap",rod((19,-2,23.62),(19,44,23.62),.3,.15),
        "flashings","IfcCovering","provisional","Standing-seam cap detail TBD")
    for i,(a,b) in enumerate([
        ((36,8,9.15),(112,8,9.15)),
        ((36,44,9.15),(112,44,9.15)),
        ((-2,-2,13.15),(-2,44,13.15)),
        ((40,-2,13.15),(40,44,13.15)),
        ((44,50,7.2),(104,50,7.2))
    ],1):
        add(f"R-GUTTER-{i:02}","Roof-edge gutter",rod(a,b,.3,.2),"drainage","IfcPipeSegment",
            "provisional","Downspout connection/size and stormwater route TBD")
    for i,(x,y,z) in enumerate([(37,8,9),(110,44,9),(0,42,13),(40,42,13),(104,50,7.2)],1):
        add(f"R-DOWNSPOUT-{i:02}","Roof-edge downspout",rod((x,y,z),(x,y,.35),.2,.2),
            "drainage","IfcPipeSegment","provisional","Sizing, discharge and site grading TBD")
    add("R-VALLEY-UNRESOLVED","Roof intersection reference flashing zone",
        rod((38,10,11),(38,42,11),.18,.12),"flashings","IfcCovering",
        "provisional","Critical: this is a reference location, not a resolved roof valley")
    issue("STR-006","Roof source section (18-ft ridge) conflicts with roof-plan ridge orientation; intersecting garage/living roof valley unresolved","Architect and structural/roof engineer")
    issue("STR-007","Verify roofing uplift, truss connections, fascia/eaves, flashing, drainage and gutter/downspout sizing","Roofing and structural engineer")

def add_studs():
    # Finish-framing review studs, clipped around all registered opening runs.
    # Such members do not encode approved exact stud spacing/load requirements.
    for wall in [
        ("A-G-NORTH","x",0,0,38,14),("A-G-SOUTH","x",42,0,38,14),
        ("A-G-WEST","y",0,0,42,14),
        ("A-L-NORTH","x",10,38,110,10),
        ("A-L-SOUTH","x",42,38,110,10),("A-L-EAST","y",110,10,42,10),
    ]:
        wall_id,axis,coord,start,end,height=wall
        holes=[o for o in OPENINGS if o["host"]==wall_id]
        i=0
        cursor=start+.5
        while cursor < end-.5:
            if not any(h["start_ft"]-.25<=cursor<=h["start_ft"]+h["width_ft"]+.25 for h in holes):
                i+=1
                if axis=="x": shape=box(cursor,coord-.26,0,.14,.52,height)
                else: shape=box(coord-.26,cursor,0,.52,.14,height)
                add(f"STUD-{wall_id}-{i:03}","Exterior stud conceptual 24in OC",shape,"frame",
                    "IfcMember","provisional","2×6 nominal, spacing/attachment TBD")
            cursor+=2
    issue("STR-008","Verify studs, shear-wall panels, portal frames and opening jamb/header detailing","Structural engineer")

def load_rooms(csv_file):
    with open(csv_file,newline="",encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            ROOMS.append({k:v for k,v in row.items()})

def write_csv(path,rows,fields):
    with open(path,"w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction="ignore")
        w.writeheader();w.writerows(rows)

def sha(path):
    d=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1048576),b""):d.update(chunk)
    return d.hexdigest()

def save_obj_mtl(output):
    obj=output/(OUT_NAME+".obj")
    mtl=output/(OUT_NAME+".mtl")
    with open(mtl,"w") as out:
        for category,color in PALETTE.items():
            out.write(f"newmtl {category}\nKd {color[0]:.4f} {color[1]:.4f} {color[2]:.4f}\nKa .05 .05 .05\nKs .08 .08 .08\nNs 18\n\n")
    vertex_offset=0
    with open(obj,"w") as out:
        out.write("# Derived metric OBJ, FreeCAD native source remains authoritative\n")
        out.write("mtllib "+mtl.name+"\n")
        for rec in MODEL:
            vertices,faces=rec["_shape"].tessellate(75.0)
            if not vertices or not faces:continue
            out.write(f"o {rec['id']}\nusemtl {rec['category']}\n")
            for vertex in vertices:
                out.write(f"v {vertex.x/1000:.6f} {vertex.y/1000:.6f} {vertex.z/1000:.6f}\n")
            for a,b,c in faces:
                out.write(f"f {a+1+vertex_offset} {b+1+vertex_offset} {c+1+vertex_offset}\n")
            vertex_offset+=len(vertices)
    return obj,mtl

def export_ifc(output):
    import ifcopenshell
    import ifcopenshell.api as api
    geometry_api = cast(Any, import_module("ifcopenshell.api.geometry"))
    add_mesh_representation = geometry_api.add_mesh_representation
    f=api.run("project.create_file",version="IFC4")
    project=api.run("root.create_entity",f,ifc_class="IfcProject",name="Barndominium Structural Concept V2")
    units=[
        api.run("unit.add_si_unit",f,unit_type="LENGTHUNIT"),
        api.run("unit.add_si_unit",f,unit_type="AREAUNIT"),
        api.run("unit.add_si_unit",f,unit_type="VOLUMEUNIT")
    ]
    api.run("unit.assign_unit",f,units=units)
    model=api.run("context.add_context",f,context_type="Model")
    body=api.run("context.add_context",f,context_type="Model",context_identifier="Body",target_view="MODEL_VIEW",parent=model)
    site=api.run("root.create_entity",f,ifc_class="IfcSite",name="Unlocated conceptual site")
    building=api.run("root.create_entity",f,ifc_class="IfcBuilding",name="Barndominium 3900 SF")
    level=api.run("root.create_entity",f,ifc_class="IfcBuildingStorey",name="Level 01")
    api.run("aggregate.assign_object",f,products=[site],relating_object=project)
    api.run("aggregate.assign_object",f,products=[building],relating_object=site)
    api.run("aggregate.assign_object",f,products=[level],relating_object=building)
    failures=[]
    entities_by_id={}
    for i,rec in enumerate(MODEL):
        try:
            entity=api.run("root.create_entity",f,ifc_class=rec["ifc_class"],name=rec["id"])
            entity.Description=(rec["title"]+" — "+rec["source_status"])[:255]
            entities_by_id[rec["id"]]=entity
            api.run("spatial.assign_container",f,products=[entity],relating_structure=level)
            verts,faces=rec["_shape"].tessellate(85.0)
            coords=[(float(v.x/1000),float(v.y/1000),float(v.z/1000)) for v in verts]
            rep=add_mesh_representation(f,context=body,vertices=[coords],faces=[[tuple(tri) for tri in faces]])
            api.run("geometry.assign_representation",f,product=entity,representation=rep)
            # Geometry is in global metric coordinates; placement stays at the origin.
            pset=api.run("pset.add_pset",f,product=entity,name="Pset_AgentSamConceptReview")
            api.run("pset.edit_pset",f,pset=pset,properties={
                "SourceStatus":rec["source_status"],
                "SourceReference":"Barndominium Owner Review v1.1",
                "ApprovalStatus":"NOT ENGINEERED / FOR CONCEPT REVIEW",
                "MaterialSpec":rec["material"][:250],
            })
        except Exception as exc:
            failures.append({"id":rec["id"],"error":str(exc)})
    # Genuine IFC opening / fill relations, in addition to actual boolean wall voids
    # already present in native FreeCAD and triangulated IFC geometry.
    for op in OPENINGS:
        try:
            code=op["id"]
            wall=entities_by_id[op["host"]]
            frame_code=code+("-GLASS" if op["type"]=="window" else "-LEAF")
            filler=entities_by_id[frame_code]
            opening=api.run("root.create_entity",f,ifc_class="IfcOpeningElement",name=code)
            opening.PredefinedType="OPENING"
            if op["axis"]=="x":
                cut=box(op["start_ft"],op["wall_coord_ft"]-.5,op["sill_ft"],
                        op["width_ft"],1.0,op["height_ft"])
            else:
                cut=box(op["wall_coord_ft"]-.5,op["start_ft"],op["sill_ft"],
                        1.0,op["width_ft"],op["height_ft"])
            verts,faces=cut.tessellate(100.0)
            representation=add_mesh_representation(f,context=body,
                vertices=[[(float(v.x/1000),float(v.y/1000),float(v.z/1000)) for v in verts]],
                faces=[[tuple(t) for t in faces]])
            api.run("geometry.assign_representation",f,product=opening,representation=representation)
            f.create_entity("IfcRelVoidsElement",
                GlobalId=ifcopenshell.guid.new(),
                RelatingBuildingElement=wall,RelatedOpeningElement=opening)
            f.create_entity("IfcRelFillsElement",
                GlobalId=ifcopenshell.guid.new(),
                RelatingOpeningElement=opening,RelatedBuildingElement=filler)
        except Exception as exc:
            failures.append({"id":op["id"],"error":"IFC relation: "+str(exc)})
    # Source rectangles become IfcSpace objects for the interior design stage.
    for room in ROOMS:
        try:
            room_id="SPACE-"+room["id"]
            entity=api.run("root.create_entity",f,ifc_class="IfcSpace",name=room["name"])
            entity.Description="Concept room rectangle (not a verified net-clear area) | "+room_id
            api.run("aggregate.assign_object",f,products=[entity],relating_object=level)
            x,y=map(float,(room["x_ft"],room["y_ft"]))
            wide,deep=map(float,(room["width_ft"],room["depth_ft"]))
            if wide<=0 or deep<=0: raise ValueError("invalid room polygon")
            h=13.0 if room["group"]=="garage" else 7.0 if room["group"]=="exterior" else 9.2
            shape=box(x,y,0,wide,deep,h)
            verts,faces=shape.tessellate(100.0)
            rep=add_mesh_representation(f,context=body,
                vertices=[[(float(v.x/1000),float(v.y/1000),float(v.z/1000)) for v in verts]],
                faces=[[tuple(t) for t in faces]])
            api.run("geometry.assign_representation",f,product=entity,representation=rep)
        except Exception as exc:
            failures.append({"id":room["id"],"error":"IFC space: "+str(exc)})
    fpath=output/(OUT_NAME+".ifc")
    f.write(str(fpath))
    return fpath,failures

def main():
    global DOC,GROUPS
    rooms_file,out=(Path(arg).resolve() for arg in sys.argv[1:3])
    out.mkdir(parents=True,exist_ok=True)
    load_rooms(rooms_file)
    DOC=App.newDocument("BarndominiumStructureV2")
    for category in PALETTE:
        group=DOC.addObject("App::DocumentObjectGroup","Group"+category.replace("-","").title())
        group.Label=category.replace("-"," ").title()
        GROUPS[category]=group
    add_foundations()
    add_grid()
    add_walls()
    add_structure()
    add_roof()
    add_studs()
    DOC.recompute()
    native=out/(OUT_NAME+".FCStd")
    DOC.saveAs(str(native))
    obj,mtl=save_obj_mtl(out)
    ifc,ifc_errors=export_ifc(out)
    write_csv(out/"elements.csv",MODEL,
        ["id","title","category","ifc_class","source_status","material","review_note","volume_m3","bbox_ft"])
    write_csv(out/"openings.csv",OPENINGS,
        ["id","host","type","axis","wall_coord_ft","start_ft","width_ft","sill_ft","height_ft","source","status"])
    write_csv(out/"rooms-source.csv",ROOMS,list(ROOMS[0]))
    write_csv(out/"design-review-required.csv",ISSUES,["id","issue","reviewer","status"])
    invalid=[e["id"] for e in MODEL if e["_shape"].isNull() or not e["_shape"].isValid()]
    counts=dict(Counter(item["category"] for item in MODEL))
    evidence_files: list[dict[str, str | int]] = []
    evidence={
        "schema":"agentsam.cad.bim-structure-concept.v2",
        "project":"Barndominium Starter Kit",
        "source":"SAM-SPACE-BARNDOMINIUM-V11 / published owner-review source",
        "units":"ft for plan coordinates; native FreeCAD millimeters; IFC/OBJ meters",
        "design_stage":"unreviewed structural concept, NOT FOR CONSTRUCTION",
        "source_review_rectangles":len(ROOMS),
        "source_enclosed_area_sqft":3900,
        "garage_sqft":1596,"living_sqft":2304,
        "native_source":native.name,
        "ifc_file":ifc.name,
        "model_elements":len(MODEL),
        "model_categories":counts,
        "real_opening_boolean_cuts":len(OPENINGS),
        "ifc_opening_relations_expected":len(OPENINGS),
        "ifc_space_relations_expected":len(ROOMS),
        "ifc_export_errors":ifc_errors,
        "invalid_brep_shapes":invalid,
        "open_design_issues":ISSUES,
        "files":evidence_files,
        "notes":[
          "Garage 14-ft eave/plate height assumed to accommodate 12-ft overhead doors",
          "Living roof ridge resolved at 18 ft using y-oriented half span; roof-plan graphic conflicts and requires review",
          "Garage roof pitch 6/12 and eaves 14 ft are provisional; unresolved valley/transition",
          "Model solids are editable FreeCAD PartDesign features, NOT approved engineered design or complete fabrication/shop trusses",
          "Interior partitions are approximate source-grid geometry and may conflict with future interior design",
          "IFC triangulated surface geometry retains distinct IFC element classes/IDs, but is not a fully parametric architectural system",
          "Foundation sizing/rebar/load path/MEP and permit details remain unapproved",
          "No unverified drawing converted into stamped construction documents",
        ]
    }
    for fn in [native,ifc,obj,mtl,out/"elements.csv",out/"openings.csv",
               out/"rooms-source.csv",out/"design-review-required.csv"]:
        evidence_files.append({"name":fn.name,"bytes":fn.stat().st_size,"sha256":sha(fn)})
    (out/"validation.json").write_text(json.dumps(evidence,indent=2)+"\n")
    print(json.dumps({key:evidence[key] for key in [
        "model_elements","model_categories","real_opening_boolean_cuts",
        "invalid_brep_shapes","ifc_export_errors","source_review_rectangles"]},indent=2))
    if invalid or ifc_errors: raise RuntimeError("Unverified invalid Brep / IFC export failures")

if __name__=="__main__": main()
