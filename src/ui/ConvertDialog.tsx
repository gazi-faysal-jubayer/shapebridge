import { createSignal, For, Show } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";
import { setState, state } from "../state/store";
import { TARGETS, hasExact, saveConverted, batchConvert, type Target, type Options } from "../convert/convert";
import type { MeshExt } from "../viewer/engine";

const groups = ["Exact solid", "Mesh", "2D drawing"] as const;
const meshTargets = TARGETS.filter((t) => t.group === "Mesh" && !t.exact);

export function ConvertDialog() {
  const [target, setTarget] = createSignal<Target>("stl");
  const [units, setUnits] = createSignal<Options["units"]>("mm");
  const [quality, setQuality] = createSignal<Options["quality"]>("normal");
  const [busy, setBusy] = createSignal("");
  const [batchTarget, setBatchTarget] = createSignal<MeshExt>("stl");
  const [batchLog, setBatchLog] = createSignal<string[]>([]);
  let batchInput!: HTMLInputElement;

  const opts = (): Options => ({ units: units(), quality: quality() });
  const run = async () => {
    setBusy("Converting…");
    try {
      await saveConverted(target(), opts());
      setBusy("Saved.");
    } catch (e) {
      setBusy(`Couldn't convert: ${(e as Error).message}`);
    }
  };
  const runBatch = async (files: File[]) => {
    if (!files.length) return;
    setBatchLog([]);
    const res = await batchConvert(files, batchTarget(), opts(), (done, total, error) => {
      setBusy(`Batch: ${done} / ${total}`);
      if (error) setBatchLog((l) => [...l, error]);
    });
    setBusy(
      `Batch done: ${res.converted} converted${res.errors.length ? `, ${res.errors.length} failed (see errors.txt in the zip)` : ""}.`,
    );
  };

  return (
    <Dialog open={state.convertOpen} onOpenChange={(o) => setState("convertOpen", o)}>
      <Dialog.Portal>
        <Dialog.Overlay class="palette-overlay" />
        <Dialog.Content class="dialog">
          <Dialog.Title class="dialog-title">Convert</Dialog.Title>
          <Show when={state.files.length} fallback={<p class="muted">Open a model first, or use batch conversion below.</p>}>
            <p class="muted small">
              {state.modelName || state.files[0]?.name} ·{" "}
              {hasExact()
                ? "exact solid available (STEP, BREP, drawings)"
                : "mesh model: exact formats need a STEP, BREP or parametric source"}
            </p>
            <label class="field">
              <span>Format</span>
              <select onChange={(e) => setTarget(e.currentTarget.value as Target)}>
                <For each={groups}>
                  {(g) => (
                    <optgroup label={g}>
                      <For each={TARGETS.filter((t) => t.group === g)}>
                        {(t) => (
                          <option value={t.id} selected={t.id === target()} disabled={t.exact && !hasExact()}>
                            {t.label}
                          </option>
                        )}
                      </For>
                    </optgroup>
                  )}
                </For>
              </select>
            </label>
            <label class="field">
              <span>Units</span>
              <select
                onChange={(e) => setUnits(e.currentTarget.value as Options["units"])}
                disabled={target() === "step" || target() === "brep"}
              >
                <option value="mm">millimetres</option>
                <option value="cm">centimetres</option>
                <option value="m">metres</option>
                <option value="in">inches</option>
              </select>
            </label>
            <Show when={target() === "stl-exact"}>
              <label class="field">
                <span>Quality</span>
                <select onChange={(e) => setQuality(e.currentTarget.value as Options["quality"])}>
                  <option value="coarse">Coarse (small file)</option>
                  <option value="normal" selected>
                    Normal
                  </option>
                  <option value="fine">Fine (smooth curves)</option>
                </select>
              </label>
            </Show>
            <p class="muted small">
              {target() === "step" || target() === "brep"
                ? "Exact solids keep their true size; the file states millimetres."
                : target() === "svg"
                  ? "Third-angle sheet with hidden lines. Open the SVG in a browser and print at 100 % to get a 1:1 PDF."
                  : "Mesh files have no unit, so the geometry is scaled to the unit you pick."}
            </p>
            <div class="row end">
              <button class="primary" onClick={run}>
                Convert and save
              </button>
            </div>
          </Show>

          <h3>Batch: several files to one format</h3>
          <div class="row">
            <select onChange={(e) => setBatchTarget(e.currentTarget.value as MeshExt)} aria-label="Batch format">
              <For each={meshTargets}>{(t) => <option value={t.id}>{t.label}</option>}</For>
            </select>
            <button onClick={() => batchInput.click()}>Choose files…</button>
            <input
              ref={batchInput}
              type="file"
              multiple
              hidden
              onChange={(e) => (runBatch([...(e.currentTarget.files ?? [])]), (e.currentTarget.value = ""))}
            />
          </div>
          <p class="muted small">Every file is opened, converted and added to one zip. Failures are listed in errors.txt.</p>
          <Show when={busy()}>
            <p role="status">{busy()}</p>
          </Show>
          <For each={batchLog()}>{(l) => <p class="error small">{l}</p>}</For>
          <div class="row end">
            <Dialog.CloseButton class="ghost">Close</Dialog.CloseButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
