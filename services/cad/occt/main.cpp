#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <GProp_GProps.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <STEPControl_Reader.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <STEPControl_Writer.hxx>
#include <Standard_Version.hxx>
#include <TopoDS_Shape.hxx>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <iomanip>
#include <stdexcept>
#include <string>

namespace {
constexpr double kMaximumMm = 1000000.0;

double dimension(const char* raw) {
  char* end = nullptr;
  const double result = std::strtod(raw, &end);
  if (end == raw || *end != '\0' || !std::isfinite(result) || result <= 0 || result > kMaximumMm) {
    throw std::invalid_argument("invalid_dimension");
  }
  return result;
}

double volume(const TopoDS_Shape& shape) {
  if (shape.IsNull() || !BRepCheck_Analyzer(shape).IsValid()) {
    throw std::runtime_error("invalid_solid");
  }
  GProp_GProps props;
  BRepGProp::VolumeProperties(shape, props);
  const double result = props.Mass();
  if (!std::isfinite(result) || result <= 0) throw std::runtime_error("invalid_solid_volume");
  return result;
}

void receipt(double volumeMm3, const char* operation) {
  std::cout << "AGENTSAM_RESULT={\"ok\":true,\"engine\":\"occt\",\"version\":\""
            << OCC_VERSION_COMPLETE << "\",\"operation\":\"" << operation
            << "\",\"volume_mm3\":" << std::setprecision(15) << volumeMm3 << "}" << std::endl;
}
}

int main(int argc, char** argv) {
  try {
    if (argc == 2 && std::string(argv[1]) == "--doctor") {
      std::cout << "AGENTSAM_RESULT={\"ok\":true,\"engine\":\"occt\",\"version\":\""
                << OCC_VERSION_COMPLETE
                << "\",\"capabilities\":[\"solid.box.create\",\"solid.inspect.step\",\"solid.export.step\"]}"
                << std::endl;
      return 0;
    }
    if (argc == 6 && std::string(argv[1]) == "--box") {
      const auto shape = BRepPrimAPI_MakeBox(
        dimension(argv[2]), dimension(argv[3]), dimension(argv[4])).Shape();
      const double measured = volume(shape);
      STEPControl_Writer writer;
      if (writer.Transfer(shape, STEPControl_AsIs) != IFSelect_RetDone ||
          writer.Write(argv[5]) != IFSelect_RetDone) {
        throw std::runtime_error("step_export_failed");
      }
      receipt(measured, "solid.box.create");
      return 0;
    }
    if (argc == 9 && std::string(argv[1]) == "--cut") {
      // Boolean cut: box(W D H) minus box(W2 D2 H2), dimensions in millimeters at this boundary.
      const auto base = BRepPrimAPI_MakeBox(dimension(argv[2]), dimension(argv[3]), dimension(argv[4])).Shape();
      const auto tool = BRepPrimAPI_MakeBox(dimension(argv[5]), dimension(argv[6]), dimension(argv[7])).Shape();
      BRepAlgoAPI_Cut cut(base, tool); cut.Build();
      if (!cut.IsDone()) throw std::runtime_error("boolean_cut_failed");
      const double measured = volume(cut.Shape());
      STEPControl_Writer writer;
      if (writer.Transfer(cut.Shape(), STEPControl_AsIs) != IFSelect_RetDone || writer.Write(argv[8]) != IFSelect_RetDone) throw std::runtime_error("step_export_failed");
      receipt(measured, "solid.cut");
      return 0;
    }
    if (argc == 3 && std::string(argv[1]) == "--inspect") {
      STEPControl_Reader reader;
      if (reader.ReadFile(argv[2]) != IFSelect_RetDone || reader.TransferRoots() < 1) {
        throw std::runtime_error("step_import_failed");
      }
      receipt(volume(reader.OneShape()), "solid.inspect.step");
      return 0;
    }
    throw std::invalid_argument("usage: --doctor | --box W D H OUT.step | --cut W D H W2 D2 H2 OUT.step | --inspect IN.step");
  } catch (const std::exception& e) {
    std::cerr << "AGENTSAM_OCCT_ERROR=" << e.what() << std::endl;
    return 1;
  }
}
