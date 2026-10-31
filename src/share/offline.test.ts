import { describe, expect, it } from "vitest";
import { viewerHtml } from "./offline";

describe("offline viewer", () => {
  it("embeds the model and can't be broken out of", () => {
    const html = viewerHtml("var OV={}; // </script><script>alert(1)</script>", '<img src=x onerror=alert(1)>"', [
      { name: 'm"); alert(1); ("x.obj', data: new Uint8Array([1, 2, 3, 255]) },
    ]);
    expect(html.match(/<\/script>/g)).toHaveLength(2); // only our two closing tags
    expect(html).not.toContain("<img src=x");
    expect(html).toContain(`"${btoa(String.fromCharCode(1, 2, 3, 255))}"`);
    expect(html).not.toContain("alert(1); (");
    expect(html).toMatch(/\["m[_a-z0-9]+x\.obj", "/);
  });
});
