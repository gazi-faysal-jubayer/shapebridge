import { createSignal, For, onCleanup, onMount } from "solid-js";
import { state, type StdView } from "../state/store";
import * as c from "../controller";
import { cubeFaceMatrix } from "../viewer/math";

const SIZE = 64;
const faces: Exclude<StdView, "iso">[] = ["front", "back", "left", "right", "top", "bottom"];

// A CSS 3D cube that mirrors the camera; each face is a standard view. No WebGL needed.
export function ViewCube() {
  const [rot, setRot] = createSignal<number[] | undefined>();
  onMount(() => onCleanup(c.onCamera(() => setRot(c.cameraRotation()))));
  return (
    <div class="viewcube" aria-label="View cube" role="group">
      <For each={faces}>
        {(f) => (
          <button
            class="face"
            style={{
              transform: rot() ? `matrix3d(${cubeFaceMatrix(f, state.upAxis, rot()!, SIZE).join(",")})` : "none",
              width: `${SIZE}px`,
              height: `${SIZE}px`,
            }}
            onClick={() => c.setView(f)}
            title={`${f[0].toUpperCase()}${f.slice(1)} view`}
          >
            {f.toUpperCase()}
          </button>
        )}
      </For>
      <button class="iso" onClick={() => c.setView("iso")} title="Isometric view (7)">
        ISO
      </button>
    </div>
  );
}
