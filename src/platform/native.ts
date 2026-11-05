// Desktop: STEP, IGES and BREP files are read by the native OpenCascade sidecar, which is several times faster
// than the WebAssembly reader on big assemblies. It returns glTF, which the viewer shows in the file's own frame.
// On the web, for files without a disk path, or if the sidecar fails, the built-in reader is used as before.

const NATIVE = /\.(step|stp|iges|igs|brep|brp)$/i;

/** Where a desktop file came from on disk (set when the app opens it by path). */
export const pathOf = new WeakMap<File, string>();

/** The native reader's glTF for a single STEP/IGES/BREP opened from disk, or null to use the built-in reader. */
export async function nativeView(files: File[]): Promise<File | null> {
  const file = files.length === 1 ? files[0] : null;
  const path = file && pathOf.get(file);
  if (!file || !path || !NATIVE.test(file.name) || !("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const glb = await invoke<ArrayBuffer>("native_import", { path });
    return new File([glb], `${file.name}.glb`);
  } catch (e) {
    console.warn("Native reader failed; using the built-in reader", e);
    return null;
  }
}
