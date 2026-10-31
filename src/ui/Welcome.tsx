import FolderOpen from "lucide-solid/icons/folder-open";
import Shapes from "lucide-solid/icons/shapes";
import Boxes from "lucide-solid/icons/boxes";
import Box from "lucide-solid/icons/box";
import ShieldCheck from "lucide-solid/icons/shield-check";
import * as c from "../controller";

export function Welcome() {
  return (
    <div class="welcome">
      <img src="logo.svg" alt="" width="64" height="64" />
      <h1>Open a CAD file</h1>
      <p class="muted">Drop it anywhere, or pick one. STEP, IGES, BREP, STL, OBJ, glTF, 3MF, FBX, IFC, Rhino 3DM, FreeCAD and more.</p>
      <div class="welcome-actions">
        <button class="primary big" onClick={() => document.getElementById("file-input")?.click()}>
          <FolderOpen size={18} /> Open file…
        </button>
        <button class="big" onClick={() => c.loadDoc()}>
          <Shapes size={18} /> New parametric part
        </button>
      </div>
      <h2>Try a sample</h2>
      <div class="samples">
        <button onClick={() => c.openSample("assembly.step")}>
          <Boxes size={22} />
          <b>Assembly</b>
          <span>STEP · 7 parts</span>
        </button>
        <button onClick={() => c.openSample("plate.step")}>
          <Box size={22} />
          <b>Plate</b>
          <span>STEP · exact solid</span>
        </button>
        <button onClick={() => c.openSample("bracket.sbridge.json")}>
          <Shapes size={22} />
          <b>Bracket</b>
          <span>parametric</span>
        </button>
      </div>
      <p class="privacy">
        <ShieldCheck size={14} /> Your files stay on this device. Live share sends them peer-to-peer, never to a server.
      </p>
      <p class="muted small">
        Press <kbd>Ctrl K</kbd> for every command.
      </p>
    </div>
  );
}
