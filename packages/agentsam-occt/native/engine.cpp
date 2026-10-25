#include "engine.hpp"
#include "sketch_solver.hpp"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepAlgoAPI_Section.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepFilletAPI_MakeChamfer.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <BRepGProp.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepOffsetAPI_MakeOffsetShape.hxx>
#include <BRepOffsetAPI_MakePipe.hxx>
#include <BRepOffsetAPI_MakeThickSolid.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <BRepTools.hxx>
#include <BRep_Tool.hxx>
#include <GProp_GProps.hxx>
#include <HLRAlgo_Projector.hxx>
#include <HLRBRep_Algo.hxx>
#include <HLRBRep_HLRToShape.hxx>
#include <STEPControl_Reader.hxx>
#include <STEPControl_Writer.hxx>
#include <Standard_Version.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_ListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <array>
#include <boost/json/src.hpp>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <gp_Ax2.hxx>
#include <gp_Trsf.hxx>
#include <iomanip>
#include <iostream>
#include <map>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <vector>
namespace {
namespace j = boost::json;
using Obj = j::object;
using Arr = j::array;
constexpr double PI = 3.14159265358979323846;
std::string str(const j::value &v) { return std::string(v.as_string()); }
std::string text(const Obj &o, const char *k) { return str(o.at(k)); }
double num(const j::value &v) {
  double d = v.is_double()   ? v.as_double()
             : v.is_int64()  ? double(v.as_int64())
             : v.is_uint64() ? double(v.as_uint64())
                             : NAN;
  if (!std::isfinite(d) || std::abs(d) > 1e9)
    throw std::runtime_error("cad_number_invalid");
  return d;
}
double val(const Obj &o, const char *k, double fallback) {
  auto p = o.if_contains(k);
  return p ? num(*p) : fallback;
}
double positive(const Obj &o, const char *k) {
  double d = num(o.at(k));
  if (d <= 1e-7 || d > 1e6)
    throw std::runtime_error("cad_dimension_invalid");
  return d;
}
gp_Pnt point(const j::value &v) {
  auto &a = v.as_array();
  if (a.size() != 3)
    throw std::runtime_error("cad_point_invalid");
  return {num(a[0]), num(a[1]), num(a[2])};
}
gp_Vec vector(const j::value &v) {
  auto p = point(v);
  return {p.X(), p.Y(), p.Z()};
}
TopoDS_Shape valid(TopoDS_Shape s, bool solid = true) {
  if (s.IsNull() || !BRepCheck_Analyzer(s).IsValid())
    throw std::runtime_error("occt_invalid_shape");
  if (solid) {
    GProp_GProps p;
    BRepGProp::VolumeProperties(s, p);
    if (p.Mass() <= 1e-8)
      throw std::runtime_error("occt_positive_solid_required");
  }
  return s;
}
double volume(const TopoDS_Shape &s) {
  GProp_GProps p;
  BRepGProp::VolumeProperties(s, p);
  return p.Mass();
}
TopoDS_Wire wire(const Arr &points, bool close) {
  if (points.size() < (close ? 3 : 2) || points.size() > 4096)
    throw std::runtime_error("profile_points_invalid");
  BRepBuilderAPI_MakePolygon p;
  for (auto &v : points)
    p.Add(point(v));
  if (close)
    p.Close();
  if (!p.IsDone())
    throw std::runtime_error("profile_wire_failed");
  return p.Wire();
}
struct Feature {
  TopoDS_Shape shape;
  std::string kind;
  Obj parameters;
};
using Model = std::map<std::string, Feature>;
const Feature &get(const Model &m, const std::string &id) {
  auto i = m.find(id);
  if (i == m.end())
    throw std::runtime_error("feature_reference_missing:" + id);
  return i->second;
}
TopoDS_Shape subshape(const TopoDS_Shape &s, TopAbs_ShapeEnum kind, int index) {
  int i = 0;
  for (TopExp_Explorer e(s, kind); e.More(); e.Next(), ++i)
    if (i == index)
      return e.Current();
  throw std::runtime_error("subshape_index_invalid");
}
std::string fingerprint(const TopoDS_Shape &s) {
  std::ostringstream geometry;
  geometry << std::scientific << std::setprecision(17) << volume(s);
  for (TopExp_Explorer e(s, TopAbs_EDGE); e.More(); e.Next()) {
    BRepAdaptor_Curve c(TopoDS::Edge(e.Current()));
    geometry << int(c.GetType());
    double a = c.FirstParameter(), b = c.LastParameter();
    for (double t : {a, (a + b) / 2, b}) {
      auto p = c.Value(t);
      geometry << p.X() << ',' << p.Y() << ',' << p.Z() << ';';
    }
  }
  uint64_t hash = 1469598103934665603ULL;
  for (unsigned char c : geometry.str())
    hash = (hash ^ c) * 1099511628211ULL;
  std::ostringstream out;
  out << std::hex << hash;
  return out.str();
}
void checkSelection(const Obj &o, const TopoDS_Shape &base) {
  auto expected = o.if_contains("baseFingerprint");
  if (!expected || str(*expected) != fingerprint(base))
    throw std::runtime_error("subshape_selection_stale_reselect_required");
}
void applyFeature(Model &m, const Obj &o) {
  auto id = text(o, "id"), t = text(o, "type");
  if (!std::regex_match(id, std::regex("[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}")))
    throw std::runtime_error("feature_id_invalid");
  if (m.count(id))
    throw std::runtime_error("feature_id_duplicate");
  TopoDS_Shape s;
  bool solid = true;
  if (t == "profile") {
    Arr points;
    if (auto sketch = o.if_contains("sketch")) {
      auto solved = agentsam::solveSketch(sketch->as_object());
      if (!solved.at("converged").as_bool())
        throw std::runtime_error("profile_constraints_inconsistent");
      for (auto &p : solved.at("points").as_array()) {
        const auto &v = p.as_object();
        points.push_back(Arr{v.at("x"), v.at("y"), val(o, "planeZ", 0)});
      }
    } else
      points = o.at("points").as_array();
    s = BRepBuilderAPI_MakeFace(wire(points, true)).Face();
    solid = false;
  } else if (t == "extrude") {
    auto v = vector(o.at("vector"));
    if (v.Magnitude() < 1e-7)
      throw std::runtime_error("extrude_vector_invalid");
    s = BRepPrimAPI_MakePrism(get(m, text(o, "profile")).shape, v).Shape();
  } else if (t == "box")
    s = BRepPrimAPI_MakeBox(positive(o, "width"), positive(o, "depth"),
                            positive(o, "height"))
            .Shape();
  else if (t == "cylinder")
    s = BRepPrimAPI_MakeCylinder(positive(o, "radius"), positive(o, "height"))
            .Shape();
  else if (t == "revolve") {
    double a = val(o, "angle", 360);
    if (std::abs(a) < 1e-7 || std::abs(a) > 360)
      throw std::runtime_error("revolve_angle_invalid");
    s = BRepPrimAPI_MakeRevol(
            get(m, text(o, "profile")).shape,
            gp_Ax1(point(o.at("origin")), gp_Dir(vector(o.at("axis")))),
            a * PI / 180)
            .Shape();
  } else if (t == "sweep")
    s = BRepOffsetAPI_MakePipe(wire(o.at("path").as_array(), false),
                               get(m, text(o, "profile")).shape)
            .Shape();
  else if (t == "wall") {
    auto &a = o.at("start").as_array();
    auto &b = o.at("end").as_array();
    if (a.size() != 2 || b.size() != 2)
      throw std::runtime_error("wall_plan_invalid");
    double x = num(a[0]), y = num(a[1]), dx = num(b[0]) - x, dy = num(b[1]) - y,
           l = std::hypot(dx, dy), th = positive(o, "thickness"),
           h = positive(o, "height");
    if (l < 1e-6)
      throw std::runtime_error("wall_length_invalid");
    s = BRepPrimAPI_MakeBox(l, th, h).Shape();
    gp_Trsf tr;
    tr.SetRotation(gp_Ax1(gp_Pnt(), gp_Dir(0, 0, 1)), std::atan2(dy, dx));
    tr.SetTranslationPart(gp_Vec(x + dy / l * th / 2, y - dx / l * th / 2, 0));
    s = BRepBuilderAPI_Transform(s, tr, true).Shape();
  } else if (t == "opening") {
    auto target = text(o, "host");
    auto host = get(m, target);
    if (host.kind != "wall")
      throw std::runtime_error("opening_wall_required");
    auto &a = host.parameters.at("start").as_array();
    auto &b = host.parameters.at("end").as_array();
    double x = num(a[0]), y = num(a[1]), dx = num(b[0]) - x, dy = num(b[1]) - y,
           l = std::hypot(dx, dy), th = positive(host.parameters, "thickness"),
           h = positive(host.parameters, "height"), w = positive(o, "width"),
           oh = positive(o, "height"), offset = val(o, "offset", 0),
           sill = val(o, "sill", 0);
    if (offset < 0 || offset + w > l + 1e-7 || sill < 0 || sill + oh > h + 1e-7)
      throw std::runtime_error("opening_outside_wall");
    s = BRepPrimAPI_MakeBox(w, th + 2, oh).Shape();
    gp_Trsf tr;
    tr.SetRotation(gp_Ax1(gp_Pnt(), gp_Dir(0, 0, 1)), std::atan2(dy, dx));
    tr.SetTranslationPart(gp_Vec(x + dx / l * offset + dy / l * (th / 2 + 1),
                                 y + dy / l * offset - dx / l * (th / 2 + 1),
                                 sill));
    s = BRepBuilderAPI_Transform(s, tr, true).Shape();
    auto cut = valid(BRepAlgoAPI_Cut(host.shape, s).Shape());
    double removed = volume(host.shape) - volume(cut), expected = w * th * oh;
    if (std::abs(removed - expected) > std::max(1e-4, expected * 1e-7))
      throw std::runtime_error("opening_volume_mismatch_or_overlap");
    m.at(target).shape = cut;
  } else if (t == "cut" || t == "fuse" || t == "common") {
    auto a = get(m, text(o, "base")).shape, b = get(m, text(o, "tool")).shape;
    s = t == "cut"    ? BRepAlgoAPI_Cut(a, b).Shape()
        : t == "fuse" ? BRepAlgoAPI_Fuse(a, b).Shape()
                      : BRepAlgoAPI_Common(a, b).Shape();
  } else if (t == "transform") {
    gp_Trsf tr;
    auto axis = o.if_contains("axis");
    double angle = val(o, "angle", 0);
    if (axis)
      tr.SetRotation(gp_Ax1(gp_Pnt(), gp_Dir(vector(*axis))), angle * PI / 180);
    auto d = o.if_contains("translation");
    if (d)
      tr.SetTranslationPart(vector(*d));
    s = BRepBuilderAPI_Transform(get(m, text(o, "base")).shape, tr, true)
            .Shape();
  } else if (t == "fillet" || t == "chamfer") {
    auto base = get(m, text(o, "base")).shape;
    checkSelection(o, base);
    double radius = positive(o, "radius");
    const auto &edges = o.at("edges").as_array();
    if (edges.empty())
      throw std::runtime_error("edge_selection_required");
    if (t == "fillet") {
      BRepFilletAPI_MakeFillet f(base);
      for (auto &e : edges)
        f.Add(radius, TopoDS::Edge(subshape(base, TopAbs_EDGE, int(num(e)))));
      f.Build();
      if (!f.IsDone())
        throw std::runtime_error("fillet_failed");
      s = f.Shape();
    } else {
      BRepFilletAPI_MakeChamfer f(base);
      for (auto &e : edges)
        f.Add(radius, TopoDS::Edge(subshape(base, TopAbs_EDGE, int(num(e)))));
      f.Build();
      if (!f.IsDone())
        throw std::runtime_error("chamfer_failed");
      s = f.Shape();
    }
  } else if (t == "offset") {
    BRepOffsetAPI_MakeOffsetShape f;
    f.PerformByJoin(get(m, text(o, "base")).shape, num(o.at("distance")), 1e-6);
    if (!f.IsDone())
      throw std::runtime_error("offset_failed");
    s = f.Shape();
  } else if (t == "shell") {
    auto base = get(m, text(o, "base")).shape;
    checkSelection(o, base);
    TopTools_ListOfShape faces;
    for (auto &v : o.at("faces").as_array())
      faces.Append(subshape(base, TopAbs_FACE, int(num(v))));
    if (faces.IsEmpty())
      throw std::runtime_error("shell_face_selection_required");
    BRepOffsetAPI_MakeThickSolid f;
    f.MakeThickSolidByJoin(base, faces, num(o.at("distance")), 1e-6);
    if (!f.IsDone())
      throw std::runtime_error("shell_failed");
    s = f.Shape();
  } else
    throw std::runtime_error("feature_type_unsupported:" + t);
  m.emplace(id, Feature{valid(s, solid), t, o});
}
Model replay(const Arr &log, size_t cursor) {
  Arr definitions;
  for (size_t k = 0; k < cursor; ++k) {
    const auto &o = log[k].as_object();
    auto type = text(o, "type");
    if (type == "$replace") {
      auto replacement = o.at("operation").as_object();
      bool found = false;
      for (auto &v : definitions)
        if (text(v.as_object(), "id") == text(replacement, "id")) {
          v = replacement;
          found = true;
          break;
        }
      if (!found)
        throw std::runtime_error("feature_replace_missing");
    } else if (type == "$syncPlan") {
      Arr next;
      for (auto &v : definitions) {
        auto source = v.as_object().if_contains("source");
        if (!source || str(*source) != "plan")
          next.push_back(v);
      }
      for (auto v : o.at("operations").as_array()) {
        v.as_object()["source"] = "plan";
        next.push_back(v);
      }
      definitions = next;
    } else
      definitions.push_back(o);
  }
  Model m;
  for (auto &v : definitions)
    applyFeature(m, v.as_object());
  return m;
}
struct Mesh {
  std::vector<float> p, n;
  std::vector<uint32_t> i;
};
Mesh mesh(TopoDS_Shape s, double deflection) {
  if (deflection < .001 || deflection > 100)
    throw std::runtime_error("mesh_deflection_invalid");
  BRepMesh_IncrementalMesh triangulate(s, deflection, false, .3, false);
  if (!triangulate.IsDone())
    throw std::runtime_error("occt_tessellation_failed");
  Mesh m;
  for (TopExp_Explorer e(s, TopAbs_FACE); e.More(); e.Next()) {
    auto f = TopoDS::Face(e.Current());
    TopLoc_Location loc;
    auto t = BRep_Tool::Triangulation(f, loc);
    if (t.IsNull())
      continue;
    for (int k = 1; k <= t->NbTriangles(); ++k) {
      int a, b, c;
      t->Triangle(k).Get(a, b, c);
      if (f.Orientation() == TopAbs_REVERSED)
        std::swap(b, c);
      auto pa = t->Node(a).Transformed(loc.Transformation()),
           pb = t->Node(b).Transformed(loc.Transformation()),
           pc = t->Node(c).Transformed(loc.Transformation());
      auto normal = gp_Vec(pa, pb).Crossed(gp_Vec(pa, pc));
      if (normal.Magnitude() < 1e-14)
        continue;
      normal.Normalize();
      for (auto p : {pa, pb, pc}) {
        m.i.push_back(uint32_t(m.p.size() / 3));
        m.p.insert(m.p.end(), {float(p.X()), float(p.Y()), float(p.Z())});
        m.n.insert(m.n.end(),
                   {float(normal.X()), float(normal.Y()), float(normal.Z())});
      }
      if (m.i.size() > 6000000)
        throw std::runtime_error("mesh_budget_exceeded");
    }
  }
  return m;
}
Obj meshJSON(const Mesh &m) {
  Arr p, n, i;
  for (float v : m.p)
    p.push_back(v);
  for (float v : m.n)
    n.push_back(v);
  for (auto v : m.i)
    i.push_back(v);
  return {{"positions", p},
          {"normals", n},
          {"indices", i},
          {"units", "mm"},
          {"axes", "z-up"}};
}
std::string b64(const std::vector<unsigned char> &b) {
  const char *c =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string s;
  for (size_t k = 0; k < b.size(); k += 3) {
    unsigned v = unsigned(b[k]) << 16;
    if (k + 1 < b.size())
      v |= unsigned(b[k + 1]) << 8;
    if (k + 2 < b.size())
      v |= b[k + 2];
    s += c[(v >> 18) & 63];
    s += c[(v >> 12) & 63];
    s += k + 1 < b.size() ? c[(v >> 6) & 63] : '=';
    s += k + 2 < b.size() ? c[v & 63] : '=';
  }
  return s;
}
void gltf(const Mesh &m, const std::string &path, const std::string &id) {
  if (m.p.empty())
    throw std::runtime_error("export_mesh_empty");
  std::vector<float> pos = m.p, norm = m.n;
  Arr lo{1e9, 1e9, 1e9}, hi{-1e9, -1e9, -1e9};
  for (size_t k = 0; k < pos.size(); k += 3) {
    float x = pos[k] * .001f, y = pos[k + 2] * .001f, z = -pos[k + 1] * .001f;
    pos[k] = x;
    pos[k + 1] = y;
    pos[k + 2] = z;
    float ny = norm[k + 2], nz = -norm[k + 1];
    norm[k + 1] = ny;
    norm[k + 2] = nz;
    for (int a = 0; a < 3; ++a) {
      lo[a] = std::min(num(lo[a]), double(pos[k + a]));
      hi[a] = std::max(num(hi[a]), double(pos[k + a]));
    }
  }
  std::vector<unsigned char> bytes;
  auto append = [&](const auto &v) {
    auto p = reinterpret_cast<const unsigned char *>(v.data());
    bytes.insert(bytes.end(), p, p + v.size() * sizeof(v[0]));
  };
  append(pos);
  append(norm);
  append(m.i);
  size_t n = pos.size() * 4;
  Obj doc{
      {"asset", Obj{{"version", "2.0"}, {"generator", "AgentSam native OCCT"}}},
      {"scene", 0},
      {"scenes", Arr{Obj{{"nodes", Arr{0}}}}},
      {"nodes",
       Arr{Obj{{"mesh", 0}, {"name", id}, {"extras", Obj{{"DesignId", id}}}}}},
      {"meshes",
       Arr{Obj{{"primitives",
                Arr{Obj{{"attributes", Obj{{"POSITION", 0}, {"NORMAL", 1}}},
                        {"indices", 2},
                        {"mode", 4}}}}}}},
      {"buffers",
       Arr{Obj{{"byteLength", bytes.size()},
               {"uri", "data:application/octet-stream;base64," + b64(bytes)}}}},
      {"bufferViews", Arr{Obj{{"buffer", 0},
                              {"byteOffset", 0},
                              {"byteLength", n},
                              {"target", 34962}},
                          Obj{{"buffer", 0},
                              {"byteOffset", n},
                              {"byteLength", n},
                              {"target", 34962}},
                          Obj{{"buffer", 0},
                              {"byteOffset", n * 2},
                              {"byteLength", m.i.size() * 4},
                              {"target", 34963}}}},
      {"accessors", Arr{Obj{{"bufferView", 0},
                            {"componentType", 5126},
                            {"count", pos.size() / 3},
                            {"type", "VEC3"},
                            {"min", lo},
                            {"max", hi}},
                        Obj{{"bufferView", 1},
                            {"componentType", 5126},
                            {"count", norm.size() / 3},
                            {"type", "VEC3"}},
                        Obj{{"bufferView", 2},
                            {"componentType", 5125},
                            {"count", m.i.size()},
                            {"type", "SCALAR"}}}}};
  std::ofstream f(path);
  f << j::serialize(doc);
  if (!f)
    throw std::runtime_error("export_write_failed");
}
// IFC GUID alphabet, deterministic project + element identity. Geometry is IFC4
// tessellation from the same BRep.
std::string guid(const std::string &s) {
  const char *alphabet =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  uint64_t a = 1469598103934665603ULL, b = 1099511628211ULL;
  for (unsigned char c : s) {
    a = (a ^ c) * 1099511628211ULL;
    b = (b + c) * 14029467366897019727ULL;
  }
  std::string v = "0";
  for (int k = 0; k < 21; ++k) {
    v += alphabet[(k < 10 ? a : b) & 63];
    if (k < 10)
      a >>= 6;
    else
      b >>= 6;
  }
  return v;
}
std::string quote(std::string s) {
  std::string r = "'";
  for (char c : s) {
    if (c == '\'')
      r += "''";
    else if (c >= 32 && c < 127)
      r += c;
    else
      r += '_';
  }
  return r + "'";
}
void ifc(const Model &m, const std::string &project, const std::string &id,
         const std::string &path, double tolerance) {
  std::ofstream f(path);
  if (!f)
    throw std::runtime_error("export_write_failed");
  f << std::setprecision(12);
  f << "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition "
       "[ReferenceView_V1.2]'),'2;1');\nFILE_NAME('AgentSam.ifc','2026-01-"
       "01T00:00:00',('AgentSam'),('Inner Animal Media'),'AgentSam "
       "OCCT','AgentSam','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n";
  int n = 0;
  auto line = [&](const std::string &s) {
    int v = ++n;
    f << '#' << v << '=' << s << ";\n";
    return v;
  };
  auto ref = [](int n) { return "#" + std::to_string(n); };
  auto p = line("IFCCARTESIANPOINT((0.,0.,0.))"),
       ax = line("IFCAXIS2PLACEMENT3D(" + ref(p) + ",$,$)"),
       context = line("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-6," +
                      ref(ax) + ",$)"),
       unit = line("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)"),
       units = line("IFCUNITASSIGNMENT((" + ref(unit) + "))"),
       pr = line("IFCPROJECT(" + quote(guid(project)) + ",$," + quote(project) +
                 ",$,$,$,$,(" + ref(context) + ")," + ref(units) + ")"),
       placement = line("IFCLOCALPLACEMENT($," + ref(ax) + ")");
  auto building =
      line("IFCBUILDING(" + quote(guid(project + ":building")) +
           ",$,'Building',$,$," + ref(placement) + ",$,$,.ELEMENT.,$,$,$)");
  line("IFCRELAGGREGATES(" + quote(guid(project + ":contains")) + ",$,$,$," +
       ref(pr) + ",(" + ref(building) + "))");
  auto product = [&](const std::string &name, const Feature &feature,
                     bool opening) {
    auto meshData = mesh(feature.shape, tolerance);
    std::map<std::array<float, 3>, uint32_t> unique;
    std::vector<float> pointsData;
    std::vector<uint32_t> indices;
    for (auto index : meshData.i) {
      std::array<float, 3> key{meshData.p[index * 3], meshData.p[index * 3 + 1],
                               meshData.p[index * 3 + 2]};
      auto [it, added] = unique.emplace(key, uint32_t(unique.size()));
      if (added)
        pointsData.insert(pointsData.end(), key.begin(), key.end());
      indices.push_back(it->second);
    }
    meshData.p = pointsData;
    meshData.i = indices;
    std::ostringstream coords, tris;
    coords << std::showpoint << std::setprecision(12)
           << "IFCCARTESIANPOINTLIST3D((";
    for (size_t k = 0; k < meshData.p.size(); k += 3) {
      if (k)
        coords << ',';
      coords << '(' << meshData.p[k] << ',' << meshData.p[k + 1] << ','
             << meshData.p[k + 2] << ')';
    }
    coords << "))";
    int points = line(coords.str());
    tris << "IFCTRIANGULATEDFACESET(" << ref(points) << ",$,.T.,(";
    for (size_t k = 0; k < meshData.i.size(); k += 3) {
      if (k)
        tris << ',';
      tris << '(' << meshData.i[k] + 1 << ',' << meshData.i[k + 1] + 1 << ','
           << meshData.i[k + 2] + 1 << ')';
    }
    tris << "),$)";
    int tri = line(tris.str()),
        shape = line("IFCSHAPEREPRESENTATION(" + ref(context) +
                     ",'Body','Tessellation',(" + ref(tri) + "))"),
        rep = line("IFCPRODUCTDEFINITIONSHAPE($,$,(" + ref(shape) + "))");
    std::string type = opening                  ? "IFCOPENINGELEMENT"
                       : feature.kind == "wall" ? "IFCWALL"
                                                : "IFCBUILDINGELEMENTPROXY";
    std::string tail = opening                  ? ",.OPENING.)"
                       : feature.kind == "wall" ? ",.NOTDEFINED.)"
                                                : ",.NOTDEFINED.)";
    return line(type + "(" + quote(guid(project + ":" + name)) + ",$," +
                quote(name) + ",$,$," + ref(placement) + "," + ref(rep) + "," +
                quote(name) + tail);
  };
  const auto &feature = get(m, id);
  int host = product(id, feature, false);
  line("IFCRELCONTAINEDINSPATIALSTRUCTURE(" +
       quote(guid(project + ":spatial:" + id)) + ",$,$,$,(" + ref(host) + ")," +
       ref(building) + ")");
  for (auto &[name, v] : m)
    if (v.kind == "opening" && text(v.parameters, "host") == id) {
      int op = product(name, v, true);
      line("IFCRELVOIDSELEMENT(" + quote(guid(project + ":void:" + name)) +
           ",$,$,$," + ref(host) + "," + ref(op) + ")");
    }
  f << "ENDSEC;\nEND-ISO-10303-21;\n";
  if (!f)
    throw std::runtime_error("export_write_failed");
}
std::string paths(const TopoDS_Shape &s) {
  std::ostringstream out;
  out << std::setprecision(10);
  for (TopExp_Explorer e(s, TopAbs_EDGE); e.More(); e.Next()) {
    BRepAdaptor_Curve curve(TopoDS::Edge(e.Current()));
    double a = curve.FirstParameter(), b = curve.LastParameter();
    if (!std::isfinite(a) || !std::isfinite(b))
      continue;
    int steps = curve.GetType() == GeomAbs_Line ? 1 : 64;
    for (int k = 0; k <= steps; ++k) {
      auto p = curve.Value(a + (b - a) * k / steps);
      out << (k ? 'L' : 'M') << p.X() << ' ' << -p.Y() << ' ';
    }
  }
  return out.str();
}
void svg(const TopoDS_Shape &s, const Obj &o, const std::string &path) {
  std::string visible, hidden;
  auto mode = text(o, "mode");
  if (mode == "section") {
    auto origin = point(o.at("origin"));
    auto dir = gp_Dir(vector(o.at("direction")));
    gp_Pln plane(origin, dir);
    BRepAlgoAPI_Section section(s, plane, false);
    section.ComputePCurveOn1(true);
    section.Approximation(true);
    section.Build();
    if (!section.IsDone())
      throw std::runtime_error("section_failed");
    gp_Trsf tr;
    tr.SetTransformation(gp_Ax3(origin, dir));
    visible =
        paths(BRepBuilderAPI_Transform(section.Shape(), tr, true).Shape());
  } else if (mode == "projection") {
    gp_Dir dir(vector(o.at("direction")));
    Handle(HLRBRep_Algo) algo = new HLRBRep_Algo;
    algo->Add(s);
    algo->Projector(HLRAlgo_Projector(gp_Ax2(gp_Pnt(), dir)));
    algo->Update();
    algo->Hide();
    HLRBRep_HLRToShape result(algo);
    visible = paths(result.VCompound()) + paths(result.OutLineVCompound());
    hidden = paths(result.HCompound()) + paths(result.OutLineHCompound());
  } else
    throw std::runtime_error("drawing_mode_invalid");
  // Bounds are taken from sampled curve paths so the complete drawing fits
  // without browser scripting.
  std::regex pair("[ML]([-+0-9.eE]+) ([-+0-9.eE]+)");
  std::string all = visible + hidden;
  double x0 = 1e30, y0 = 1e30, x1 = -1e30, y1 = -1e30;
  for (std::sregex_iterator i(all.begin(), all.end(), pair), end; i != end;
       ++i) {
    double x = std::stod((*i)[1]), y = std::stod((*i)[2]);
    x0 = std::min(x0, x);
    x1 = std::max(x1, x);
    y0 = std::min(y0, y);
    y1 = std::max(y1, y);
  }
  if (x0 > x1)
    throw std::runtime_error("drawing_empty");
  double margin = std::max(1., std::max(x1 - x0, y1 - y0) * .02);
  std::ofstream f(path);
  f << "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"" << x0 - margin
    << ' ' << y0 - margin << ' ' << x1 - x0 + 2 * margin << ' '
    << y1 - y0 + 2 * margin
    << "\"><g fill=\"none\" stroke=\"black\" stroke-width=\"0.5\" "
       "vector-effect=\"non-scaling-stroke\"><path d=\""
    << visible << "\"/><path stroke-dasharray=\"4 2\" stroke=\"#777\" d=\""
    << hidden << "\"/></g></svg>";
  if (!f)
    throw std::runtime_error("export_write_failed");
}
class Engine {
  std::string project;
  Arr log;
  size_t cursor = 0;
  Model model;
  uint64_t revision = 0;
  Obj summary() {
    Arr features;
    for (auto &[id, f] : model) {
      if (f.kind == "profile")
        continue;
      features.push_back(Obj{{"id", id},
                             {"type", f.kind},
                             {"fingerprint", fingerprint(f.shape)},
                             {"volume_mm3", volume(f.shape)}});
    }
    return {{"projectId", project},
            {"revision", revision},
            {"cursor", cursor},
            {"operationCount", log.size()},
            {"features", features}};
  }

public:
  Obj request(const Obj &r) {
    std::string a = text(r, "action");
    if (a == "solveSketch")
      return agentsam::solveSketch(r);
    if (a == "open") {
      auto p = text(r, "projectId");
      if (!std::regex_match(p, std::regex("[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}")))
        throw std::runtime_error("project_id_invalid");
      Arr candidate =
          r.if_contains("operations") ? r.at("operations").as_array() : Arr{};
      size_t c = r.if_contains("cursor") ? size_t(num(r.at("cursor")))
                                         : candidate.size();
      if (c > candidate.size() || candidate.size() > 10000)
        throw std::runtime_error("log_cursor_invalid");
      auto m = replay(candidate, c);
      project = p;
      log = candidate;
      cursor = c;
      model = m;
      ++revision;
      return summary();
    }
    if (project.empty())
      throw std::runtime_error("project_not_open");
    if (auto expected = r.if_contains("expectedRevision");
        expected && num(*expected) != double(revision))
      throw std::runtime_error("revision_conflict");
    if (a == "apply" || a == "replace" || a == "syncPlan" || a == "undo" ||
        a == "redo") {
      Arr candidate = log;
      size_t c = cursor;
      if (a == "apply") {
        candidate.resize(cursor);
        auto operation = r.at("operation").as_object();
        auto type = text(operation, "type");
        if ((type == "fillet" || type == "chamfer" || type == "shell") &&
            !operation.if_contains("baseFingerprint"))
          operation["baseFingerprint"] =
              fingerprint(get(model, text(operation, "base")).shape);
        candidate.push_back(operation);
        ++c;
      } else if (a == "replace" || a == "syncPlan") {
        candidate.resize(cursor);
        candidate.push_back(
            a == "replace"
                ? Obj{{"type", "$replace"}, {"operation", r.at("operation")}}
                : Obj{{"type", "$syncPlan"},
                      {"operations", r.at("operations")}});
        ++c;
      } else if (a == "undo") {
        if (!c)
          throw std::runtime_error("undo_empty");
        --c;
      } else {
        if (c >= candidate.size())
          throw std::runtime_error("redo_empty");
        ++c;
      }
      if (candidate.size() > 10000)
        throw std::runtime_error("log_budget_exceeded");
      auto m = replay(candidate, c);
      log = candidate;
      cursor = c;
      model = m;
      ++revision;
      return summary();
    }
    if (a == "state") {
      auto out = summary();
      out["operations"] = log;
      return out;
    }
    auto id = text(r, "id");
    const auto &f = get(model, id);
    if (a == "mesh") {
      auto out = meshJSON(mesh(f.shape, val(r, "deflection", .5)));
      out["id"] = id;
      out["fingerprint"] = fingerprint(f.shape);
      out["volume_mm3"] = volume(f.shape);
      out["revision"] = revision;
      return out;
    }
    if (a == "export") {
      auto format = text(r, "format"), path = text(r, "path");
      if (path.empty() || path[0] != '/')
        throw std::runtime_error("export_absolute_path_required");
      if (format == "step") {
        STEPControl_Writer w;
        if (w.Transfer(f.shape, STEPControl_AsIs) != IFSelect_RetDone ||
            w.Write(path.c_str()) != IFSelect_RetDone)
          throw std::runtime_error("step_export_failed");
        STEPControl_Reader check;
        if (check.ReadFile(path.c_str()) != IFSelect_RetDone ||
            !check.TransferRoots())
          throw std::runtime_error("step_reopen_failed");
        double original = volume(f.shape),
               actual = volume(valid(check.OneShape()));
        if (std::abs(original - actual) > std::max(1e-4, original * 1e-7))
          throw std::runtime_error("step_roundtrip_mismatch");
      } else if (format == "brep") {
        if (!BRepTools::Write(f.shape, path.c_str()))
          throw std::runtime_error("brep_export_failed");
        TopoDS_Shape restored;
        BRep_Builder b;
        if (!BRepTools::Read(restored, path.c_str(), b) ||
            std::abs(volume(valid(restored)) - volume(f.shape)) >
                std::max(1e-4, volume(f.shape) * 1e-7))
          throw std::runtime_error("brep_roundtrip_mismatch");
      } else if (format == "gltf")
        gltf(mesh(f.shape, val(r, "deflection", .5)), path, id);
      else if (format == "ifc")
        ifc(model, project, id, path, val(r, "deflection", .5));
      else if (format == "svg")
        svg(f.shape, r, path);
      else
        throw std::runtime_error("export_format_unsupported");
      return {{"id", id},
              {"format", format},
              {"path", path},
              {"volume_mm3", volume(f.shape)},
              {"revision", revision}};
    }
    throw std::runtime_error("engine_action_unsupported");
  }
};
} // namespace
int serveEngine() {
  Engine engine;
  std::string line;
  while (std::getline(std::cin, line)) {
    Obj result;
    try {
      if (line.size() > 8 * 1024 * 1024)
        throw std::runtime_error("request_budget_exceeded");
      auto request = j::parse(line).as_object();
      result = engine.request(request);
      if (auto id = request.if_contains("requestId"))
        result["requestId"] = *id;
      result["ok"] = true;
      result["engine"] = "occt";
      result["version"] = OCC_VERSION_COMPLETE;
    } catch (const Standard_Failure &e) {
      result = {{"ok", false},
                {"engine", "occt"},
                {"error",
                 e.GetMessageString() ? e.GetMessageString() : "occt_failure"}};
    } catch (const std::exception &e) {
      result = {{"ok", false}, {"engine", "occt"}, {"error", e.what()}};
    }
    std::cout << "AGENTSAM_RESULT=" << j::serialize(result) << std::endl;
  }
  return 0;
}
