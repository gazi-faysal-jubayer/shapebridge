import { For, Show } from "solid-js";
import { Command } from "cmdk-solid";
import { setState, state } from "../state/store";
import { actions, type Action } from "./actions";

const groups: Action["group"][] = ["File", "View", "Inspect", "Design", "Share", "Help"];

export function CommandPalette() {
  const run = (a: Action) => {
    setState("paletteOpen", false);
    a.run();
  };
  return (
    <Command.Dialog
      open={state.paletteOpen}
      onOpenChange={(o: boolean) => setState("paletteOpen", o)}
      label="Command palette"
      contentClassName="palette"
      overlayClassName="palette-overlay"
    >
      <Command.Input placeholder="Type a command…" />
      <Command.List>
        <Command.Empty>No matching command.</Command.Empty>
        <For each={groups}>
          {(g) => (
            <Command.Group heading={g}>
              <For each={actions.filter((a) => a.group === g && a.id !== "palette" && (!a.enabled || a.enabled()))}>
                {(a) => (
                  <Command.Item value={`${g} ${a.label}`} onSelect={() => run(a)}>
                    <span>{a.label}</span>
                    <Show when={a.keys}>
                      <kbd>{a.keys}</kbd>
                    </Show>
                  </Command.Item>
                )}
              </For>
            </Command.Group>
          )}
        </For>
      </Command.List>
    </Command.Dialog>
  );
}
