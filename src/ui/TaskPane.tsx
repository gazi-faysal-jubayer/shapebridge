import { createEffect, createSignal, For, Show } from "solid-js";
import Info from "lucide-solid/icons/info";
import MessageSquare from "lucide-solid/icons/message-square";
import Library from "lucide-solid/icons/library";
import { templates } from "../model/doc";
import { live } from "../live";
import { Properties } from "./Properties";
import { ReviewPanel } from "./ReviewPanel";
import { Icon } from "./icons";
import * as c from "../controller";

const PANES = [
  { id: "props", label: "Properties", icon: () => <Info size={18} /> },
  { id: "review", label: "Review", icon: () => <MessageSquare size={18} /> },
  { id: "library", label: "Design library", icon: () => <Library size={18} /> },
] as const;
type Pane = (typeof PANES)[number]["id"];

/** Right-hand task pane with a vertical tab strip, like a CAD task pane. */
export function TaskPane(props: { width: number }) {
  const [pane, setPane] = createSignal<Pane>("props");
  // a review session or a new comment brings the Review pane forward
  createEffect(() => (live.role !== "none" || live.draft) && setPane("review"));
  return (
    <aside class="side right task-pane" style={{ width: `${props.width}px` }}>
      <div class="task-body">
        <Show when={pane() === "props"}>
          <Properties />
        </Show>
        <Show when={pane() === "review"}>
          <ReviewPanel />
        </Show>
        <Show when={pane() === "library"}>
          <DesignLibrary />
        </Show>
      </div>
      <div class="task-tabs" role="tablist" aria-orientation="vertical" aria-label="Task pane">
        <For each={PANES}>
          {(p) => (
            <button
              role="tab"
              aria-selected={pane() === p.id}
              classList={{ on: pane() === p.id }}
              onClick={() => setPane(p.id)}
              title={p.label}
              aria-label={p.label}
            >
              {p.icon()}
              <Show when={p.id === "review" && live.comments.length}>
                <span class="badge">{live.comments.length}</span>
              </Show>
            </button>
          )}
        </For>
      </div>
    </aside>
  );
}

function DesignLibrary() {
  return (
    <div class="library">
      <h2>Design library</h2>
      <h3>Part templates</h3>
      <div class="templates">
        <For each={templates}>
          {(t) => (
            <button onClick={() => c.loadDoc(t)} title={`Start from the ${t.name} template`}>
              <Icon name="newPart" size={22} />
              <b>{t.name}</b>
              <span>
                {t.params.length} parameters · {t.features.length} features
              </span>
            </button>
          )}
        </For>
      </div>
      <h3>Sample files</h3>
      <div class="templates">
        <For
          each={
            [
              ["assembly.step", "7-part assembly"],
              ["plate.step", "exact solid"],
              ["plate.stl", "mesh"],
            ] as const
          }
        >
          {([file, note]) => (
            <button onClick={() => c.openSample(file)}>
              <Icon name="part" size={22} />
              <b class="file-name">{file}</b>
              <span>{note}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
