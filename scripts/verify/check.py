"""Runs ShapeBridge's golden exports in the real target tools and compares volumes with the kernel's.

Usage: python scripts/verify/check.py [cadquery] [openscad] [freecad]
Reference volumes: src/interop/__golden__/volumes.json (written by src/kernel/build.test.ts).
"""
import json
import os
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "..", "..", "src", "interop", "__golden__")
TOLERANCE = 0.005  # 0.5 %: tessellation (OpenSCAD) and kernel tolerance differences


def stl_volume(path):
    """Signed-tetrahedron volume of a binary or ASCII STL."""
    with open(path, "rb") as f:
        data = f.read()
    tris = []
    if data[:5] == b"solid" and b"facet" in data[:300]:
        verts = [tuple(map(float, l.split()[1:4])) for l in data.decode().splitlines() if l.strip().startswith("vertex")]
        tris = [verts[i:i + 3] for i in range(0, len(verts), 3)]
    else:
        (n,) = struct.unpack_from("<I", data, 80)
        for i in range(n):
            vals = struct.unpack_from("<12f", data, 84 + i * 50)
            tris.append((vals[3:6], vals[6:9], vals[9:12]))
    vol = 0.0
    for a, b, c in tris:
        vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    return abs(vol)


def cadquery_volume(path):
    import cadquery as cq  # noqa: F401  (imported by the script itself too)
    scope = {"__name__": "verify"}
    with open(path) as f:
        exec(compile(f.read(), path, "exec"), scope)
    return scope["result"].val().Volume()


def openscad_volume(path):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "out.stl")
        subprocess.run(["openscad", "--export-format", "binstl", "-o", out, path], check=True, capture_output=True)
        return stl_volume(out)


def freecad_volume(path, name):
    script = (
        "import FreeCAD as App\n"
        f"exec(open({path!r}).read())\n"
        f"objs = [o for o in App.ActiveDocument.Objects if o.Label == {name!r}]\n"
        "print('VOLUME', objs[0].Shape.Volume)\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(script)
    res = subprocess.run(["freecadcmd", f.name], capture_output=True, text=True)
    for line in (res.stdout + res.stderr).splitlines():
        if line.startswith("VOLUME"):
            return float(line.split()[1])
    raise RuntimeError(res.stdout[-2000:] + res.stderr[-2000:])


def main(tools):
    with open(os.path.join(GOLDEN, "volumes.json")) as f:
        expected = json.load(f)
    failures = 0
    for name, ref in expected.items():
        for tool in tools:
            ext = {"cadquery": "cadquery.py", "openscad": "openscad.scad", "freecad": "freecad.FCMacro"}[tool]
            path = os.path.join(GOLDEN, f"{name}.{ext}")
            src = open(path).read()
            # OpenSCAD has no fillet/chamfer/shell; its file says so, and only has to run
            approximate = tool == "openscad" and "has no OpenSCAD equivalent" in src
            try:
                vol = {"cadquery": lambda: cadquery_volume(path), "openscad": lambda: openscad_volume(path), "freecad": lambda: freecad_volume(path, name)}[tool]()
            except Exception as e:  # report every target, then fail once
                print(f"FAIL {name:10} {tool:9} error: {e}")
                failures += 1
                continue
            diff = abs(vol - ref) / ref
            ok = approximate or diff <= TOLERANCE
            failures += not ok
            note = " (features skipped in OpenSCAD, run-only)" if approximate else ""
            print(f"{'ok  ' if ok else 'FAIL'} {name:10} {tool:9} {vol:12.1f} vs {ref:12.1f}  {diff * 100:6.2f}%{note}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main(sys.argv[1:] or ["cadquery", "openscad", "freecad"])
