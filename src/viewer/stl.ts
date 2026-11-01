// A lean STL reader for very large meshes: typed arrays only (no per-vertex objects), plus exact
// size, area and volume computed in the same pass. Runs in a worker; see import.worker.ts.

export interface MeshStats {
  triangles: number;
  min: [number, number, number];
  max: [number, number, number];
  area: number;
  /** signed-tetrahedron volume; meaningful for closed, consistently wound meshes */
  volume: number;
}

export interface LeanMesh {
  positions: Float32Array;
  normals: Float32Array;
  stats: MeshStats;
}

const isBinary = (buf: ArrayBuffer) => {
  if (buf.byteLength < 84) return false;
  const n = new DataView(buf).getUint32(80, true);
  // ASCII files can start with "solid" too, so trust the size check, which binary files always pass
  return 84 + n * 50 === buf.byteLength;
};

/** Reads binary or ASCII STL into flat, non-indexed triangle arrays. */
export function parseStl(buf: ArrayBuffer): LeanMesh {
  const pos = isBinary(buf) ? binaryPositions(buf) : asciiPositions(buf);
  return { positions: pos, ...shade(pos) };
}

function binaryPositions(buf: ArrayBuffer): Float32Array {
  const dv = new DataView(buf);
  const n = dv.getUint32(80, true);
  const out = new Float32Array(n * 9);
  for (let t = 0, o = 84; t < n; t++, o += 50) for (let k = 0; k < 9; k++) out[t * 9 + k] = dv.getFloat32(o + 12 + k * 4, true);
  return out;
}

function asciiPositions(buf: ArrayBuffer): Float32Array {
  const text = new TextDecoder().decode(buf);
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  const vals: number[] = [];
  for (let m; (m = re.exec(text));) vals.push(+m[1], +m[2], +m[3]);
  if (vals.length % 9 || vals.some(Number.isNaN)) throw new Error("Not a valid STL file");
  return Float32Array.from(vals);
}

/** Flat normals, bounding box, surface area and volume in one pass. */
function shade(p: Float32Array): { normals: Float32Array; stats: MeshStats } {
  const normals = new Float32Array(p.length);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let area = 0;
  let volume = 0;
  for (let i = 0; i < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5], p[i + 6], p[i + 7], p[i + 8]];
    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az;
    const vx = cx - ax,
      vy = cy - ay,
      vz = cz - az;
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    area += len / 2;
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const s = len ? 1 / len : 0;
    for (let k = 0; k < 9; k += 3) {
      normals[i + k] = nx * s;
      normals[i + k + 1] = ny * s;
      normals[i + k + 2] = nz * s;
    }
    for (let k = 0; k < 9; k++) {
      const a = k % 3;
      if (p[i + k] < min[a]) min[a] = p[i + k];
      if (p[i + k] > max[a]) max[a] = p[i + k];
    }
  }
  return { normals, stats: { triangles: p.length / 9, min, max, area, volume } };
}

/** Binary STL from flat triangle positions (the lean path's export), optionally scaled. */
export function writeStl(p: Float32Array, scale = 1): Uint8Array {
  const n = p.length / 9;
  const out = new Uint8Array(84 + n * 50);
  const dv = new DataView(out.buffer);
  new TextEncoder().encodeInto("ShapeBridge export", out);
  dv.setUint32(80, n, true);
  for (let t = 0, o = 84; t < n; t++, o += 50) for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, p[t * 9 + k] * scale, true);
  return out;
}
