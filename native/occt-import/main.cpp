// shapebridge-occt: converts a STEP, IGES or BREP file to binary glTF with native OpenCascade, keeping the
// assembly tree, part names and colours. The desktop app runs it as a separate process (sidecar), so OCCT
// (LGPL-2.1) stays a separate module and a crash in a bad file can't take the app down.
//
//   shapebridge-occt <input.step|.stp|.iges|.igs|.brep> <output.glb>
//
// Output stays in the file's own Z-up frame and millimetres; the viewer treats it like the STEP it came from.
// Progress lines go to stderr as `phase <name> <seconds>`; the exit code is 0 on success.
#include <BRepBndLib.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <Bnd_Box.hxx>
#include <IGESCAFControl_Reader.hxx>
#include <Message_ProgressRange.hxx>
#include <OSD_Parallel.hxx>
#include <RWGltf_CafWriter.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <TColStd_IndexedDataMapOfStringString.hxx>
#include <TDF_LabelSequence.hxx>
#include <TDocStd_Document.hxx>
#include <TopoDS_Shape.hxx>
#include <XCAFApp_Application.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

using Clock = std::chrono::steady_clock;
static Clock::time_point mark = Clock::now();
static void phase(const char* name) {
  std::fprintf(stderr, "phase %s %.2f\n", name, std::chrono::duration<double>(Clock::now() - mark).count());
  mark = Clock::now();
}

static std::string lower(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return (char)std::tolower(c); });
  return s;
}

static bool read(const std::string& path, const Handle(TDocStd_Document) & doc) {
  const std::string ext = lower(path.substr(path.find_last_of('.') + 1));
  if (ext == "step" || ext == "stp") {
    STEPCAFControl_Reader r;
    r.SetColorMode(true);
    r.SetNameMode(true);
    r.SetLayerMode(false);
    if (r.ReadFile(path.c_str()) != IFSelect_RetDone) return false;
    phase("parse");
    return r.Transfer(doc);
  }
  if (ext == "iges" || ext == "igs") {
    IGESCAFControl_Reader r;
    r.SetColorMode(true);
    r.SetNameMode(true);
    if (r.ReadFile(path.c_str()) != IFSelect_RetDone) return false;
    phase("parse");
    return r.Transfer(doc);
  }
  if (ext == "brep" || ext == "brp") {
    TopoDS_Shape shape;
    BRep_Builder builder;
    if (!BRepTools::Read(shape, path.c_str(), builder)) return false;
    phase("parse");
    XCAFDoc_DocumentTool::ShapeTool(doc->Main())->AddShape(shape);
    return true;
  }
  std::fprintf(stderr, "error unsupported file type .%s\n", ext.c_str());
  return false;
}

int main(int argc, char** argv) {
  if (argc != 3) {
    std::fprintf(stderr, "usage: shapebridge-occt <input.step|.iges|.brep> <output.glb>\n");
    return 2;
  }
  Handle(TDocStd_Document) doc;
  XCAFApp_Application::GetApplication()->NewDocument("BinXCAF", doc);
  if (!read(argv[1], doc)) {
    std::fprintf(stderr, "error could not read %s\n", argv[1]);
    return 3;
  }
  phase("transfer");

  // Mesh every distinct part once, in parallel. Each part gets 0.1% of its own size as the chord tolerance
  // (what occt-import-js does in the web app), so small parts stay smooth next to big ones.
  Handle(XCAFDoc_ShapeTool) tool = XCAFDoc_DocumentTool::ShapeTool(doc->Main());
  TDF_LabelSequence labels;
  tool->GetShapes(labels);
  std::vector<TopoDS_Shape> parts;
  for (Standard_Integer i = 1; i <= labels.Length(); i++)
    if (XCAFDoc_ShapeTool::IsSimpleShape(labels.Value(i))) parts.push_back(XCAFDoc_ShapeTool::GetShape(labels.Value(i)));
  OSD_Parallel::For(0, (int)parts.size(), [&](int i) {
    Bnd_Box box;
    BRepBndLib::Add(parts[i], box);
    if (box.IsVoid()) return;
    BRepMesh_IncrementalMesh(parts[i], std::sqrt(box.SquareExtent()) * 0.001, false, 0.5, false);
  });
  phase("mesh");

  Standard_Real unit = 1.0; // metres per document unit
  if (!XCAFDoc_DocumentTool::GetLengthUnit(doc, unit)) unit = 0.001;
  RWGltf_CafWriter writer(argv[2], true);
  RWMesh_CoordinateSystemConverter& cs = writer.ChangeCoordinateSystemConverter();
  cs.SetInputLengthUnit(unit);
  cs.SetInputCoordinateSystem(RWMesh_CoordinateSystem_Zup);
  cs.SetOutputLengthUnit(0.001); // keep millimetres, as the STEP had them
  cs.SetOutputCoordinateSystem(RWMesh_CoordinateSystem_Zup);
  writer.SetMergeFaces(true); // one mesh per part instead of one per face: far fewer draw calls
  TColStd_IndexedDataMapOfStringString meta;
  if (!writer.Perform(doc, meta, Message_ProgressRange())) {
    std::fprintf(stderr, "error could not write %s\n", argv[2]);
    return 4;
  }
  phase("write");
  std::fprintf(stderr, "parts %zu\n", parts.size());
  return 0;
}
