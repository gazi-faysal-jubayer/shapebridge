import { createSignal, For, Show } from "solid-js";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Eye from "lucide-solid/icons/eye";
import EyeOff from "lucide-solid/icons/eye-off";
import Bookmark from "lucide-solid/icons/bookmark";
import X from "lucide-solid/icons/x";
import { state, type TreeNode } from "../state/store";
import * as c from "../controller";

export function ModelTree() {
  return (
    <div class="tree-wrap">
      <Show when={state.tree} fallback={<p class="muted pad">No model open.</p>}>
        <ul class="tree" role="tree" aria-label="Model tree">
          <Node node={state.tree!} depth={0} />
        </ul>
      </Show>
      <Show when={state.tree}>
        <section class="views">
          <header>
            <h3>Saved views</h3>
            <button class="ghost" onClick={c.saveView} title="Save current view (V)">
              <Bookmark size={14} /> Save
            </button>
          </header>
          <Show when={state.views.length} fallback={<p class="muted">Camera, hidden parts and section, per file.</p>}>
            <ul>
              <For each={state.views}>
                {(v, i) => (
                  <li>
                    <button class="link" onClick={() => c.restoreView(i())}>
                      {v.name}
                    </button>
                    <button class="ghost" onClick={() => c.deleteView(i())} aria-label={`Delete ${v.name}`}>
                      <X size={13} />
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </Show>
    </div>
  );
}

function Node(props: { node: TreeNode; depth: number }) {
  const [open, setOpen] = createSignal(props.depth < 2);
  const hidden = () => props.node.keys.every((k) => state.hidden.includes(k));
  const selected = () => props.node.keys.length > 0 && props.node.keys.every((k) => state.selection.includes(k));
  const pick = (e: MouseEvent) => {
    const keys = props.node.keys;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const set = new Set(state.selection);
      const on = keys.every((k) => set.has(k));
      keys.forEach((k) => (on ? set.delete(k) : set.add(k)));
      c.select([...set]);
    } else c.select([...keys]);
  };
  return (
    <li role="treeitem" aria-expanded={props.node.children.length ? open() : undefined} aria-selected={selected()}>
      <div class="row" classList={{ selected: selected(), hidden: hidden() }} style={{ "padding-left": `${props.depth * 14 + 4}px` }}>
        <button
          class="twisty"
          classList={{ open: open(), none: !props.node.children.length }}
          onClick={() => setOpen((o) => !o)}
          tabIndex={-1}
          aria-hidden="true"
        >
          <ChevronRight size={13} />
        </button>
        <button class="label" onClick={pick} onDblClick={c.fit} title={props.node.name}>
          {props.node.name}
        </button>
        <button
          class="ghost eye"
          onClick={() => c.toggleHidden(props.node.keys)}
          aria-label={hidden() ? `Show ${props.node.name}` : `Hide ${props.node.name}`}
        >
          <Show when={hidden()} fallback={<Eye size={14} />}>
            <EyeOff size={14} />
          </Show>
        </button>
      </div>
      <Show when={open() && props.node.children.length}>
        <ul role="group">
          <For each={props.node.children}>{(child) => <Node node={child} depth={props.depth + 1} />}</For>
        </ul>
      </Show>
    </li>
  );
}
