// occt-import-js ships no types; this declares the part the sample smoke test uses
declare module "occt-import-js" {
  type Result = { success: boolean; meshes: { index: { array: number[] } }[] };
  const init: () => Promise<{ ReadStepFile(content: Uint8Array, params: null): Result }>;
  export default init;
}
