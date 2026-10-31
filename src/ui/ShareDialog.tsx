import { Show } from "solid-js";
import * as c from "../controller";

export function ShareDialog() {
  return (
    <Show when={c.shareLink()}>
      <div class="share" role="dialog" aria-label="Live share">
        <strong>Live share is on</strong>
        <p>Send this link. It opens in any browser, and the file goes straight from this computer, peer-to-peer.</p>
        <div class="row">
          <input readonly value={c.shareLink()} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
          <button onClick={() => navigator.clipboard.writeText(c.shareLink())}>Copy</button>
        </div>
        <label>
          <input type="checkbox" checked={c.follow()} onChange={(e) => c.setFollow(e.currentTarget.checked)} /> Viewers follow my camera
        </label>
        <p class="muted">{c.peers()} viewer(s) connected</p>
        <button onClick={c.stopShare}>Stop sharing</button>
      </div>
    </Show>
  );
}
