// Native files of closed CAD programs. Their formats are proprietary, so no open-source app can read them; we say
// so plainly and explain the export, instead of "no importable file". Bridges to the real programs are tracked
// in the "SolidWorks files" epic (#288).

const VENDORS: { ext: RegExp; app: string; how: string }[] = [
  { ext: /\.(sldprt|sldasm|slddrw)$/i, app: "SolidWorks", how: "File → Save As → STEP AP214 (*.step)" },
  { ext: /\.(ipt|iam|idw)$/i, app: "Inventor", how: "File → Export → CAD Format → STEP" },
  { ext: /\.(catpart|catproduct|catdrawing)$/i, app: "CATIA", how: "File → Save As → stp" },
  { ext: /\.f3d$/i, app: "Fusion 360", how: "File → Export → STEP" },
  { ext: /\.prt$/i, app: "NX or Creo", how: "File → Export (or Save a Copy) → STEP" },
];

/** A user-facing explanation when `name` is a closed CAD program's native file, otherwise null. */
export function vendorFileMessage(name: string): string | null {
  const v = VENDORS.find((v) => v.ext.test(name));
  if (!v) return null;
  return `${name} is a ${v.app} file. Only ${v.app} can read its geometry. In ${v.app}, use ${v.how}, then open the STEP file here.`;
}
