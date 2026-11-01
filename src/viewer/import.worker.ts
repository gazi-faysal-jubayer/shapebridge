/// <reference lib="webworker" />
// Parses very large meshes off the main thread; the typed arrays are transferred back, not copied.
import { parseStl } from "./stl";

self.onmessage = async (e: MessageEvent<File>) => {
  try {
    const m = parseStl(await e.data.arrayBuffer());
    self.postMessage({ ok: true, mesh: m }, [m.positions.buffer, m.normals.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: (err as Error).message });
  }
};
