import { createSignal, For, Show } from "solid-js";
import X from "lucide-solid/icons/x";
import { setState, state } from "../state/store";
import * as l from "../live";
import { live } from "../live";

export function ShareDialog() {
  const [small, setSmall] = createSignal(false);
  return (
    <>
      <Show when={live.role === "host" && small()}>
        <button class="share-pill" onClick={() => setSmall(false)}>
          ● Live review · {live.peers.length} viewer(s)
        </button>
      </Show>
      <Show when={live.role === "host" && !small()}>
        <div class="share" role="dialog" aria-label="Live review">
          <div class="row">
            <strong>Live review is on</strong>
            <button class="ghost" style={{ "margin-left": "auto" }} onClick={() => setSmall(true)} aria-label="Minimise">
              –
            </button>
          </div>
          <p>Send this link. It opens in any browser; the model goes straight from this computer, peer-to-peer.</p>
          <div class="row">
            <input readonly value={live.link} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
            <button onClick={() => navigator.clipboard.writeText(live.link)}>Copy</button>
          </div>
          <label class="field">
            <span>Your name</span>
            <input
              value={state.settings.reviewName}
              placeholder="Presenter"
              maxLength={40}
              onChange={(e) => setState("settings", "reviewName", e.currentTarget.value)}
            />
          </label>
          <h3>In this review ({live.peers.length})</h3>
          <Show when={live.peers.length} fallback={<p class="muted small">Nobody has joined yet.</p>}>
            <ul class="people">
              <For each={live.peers}>
                {(p) => (
                  <li>
                    <span class="dot" style={{ background: p.color }} /> {p.name}
                    <button class="ghost" onClick={() => l.kick(p.id)} aria-label={`Remove ${p.name}`} title="Remove from the review">
                      <X size={13} />
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <label>
            <input type="checkbox" checked={live.allowDownload} onChange={(e) => l.setAllowDownload(e.currentTarget.checked)} /> Viewers may
            export the model
          </label>
          <label class="field">
            <span>Ends after</span>
            <select onChange={(e) => l.setExpiry(e.currentTarget.value === "0" ? null : +e.currentTarget.value)}>
              <option value="0">No limit</option>
              <option value="1">1 hour</option>
              <option value="8">8 hours</option>
              <option value="24">24 hours</option>
            </select>
          </label>
          <p class="muted small">
            Hold <kbd>L</kbd> to show everyone your laser pointer. Viewers follow your camera, section and explode.
          </p>
          <details>
            <summary>Network (TURN relay)</summary>
            <p class="muted small">Only needed when a viewer's company network blocks peer-to-peer. Applies to the next session.</p>
            <label class="field">
              <span>TURN URL</span>
              <input
                value={state.settings.turn.urls}
                placeholder="turn:turn.example.com:3478"
                onChange={(e) => setState("settings", "turn", "urls", e.currentTarget.value.trim())}
              />
            </label>
            <label class="field">
              <span>Username</span>
              <input
                value={state.settings.turn.username}
                onChange={(e) => setState("settings", "turn", "username", e.currentTarget.value)}
              />
            </label>
            <label class="field">
              <span>Credential</span>
              <input
                type="password"
                value={state.settings.turn.credential}
                onChange={(e) => setState("settings", "turn", "credential", e.currentTarget.value)}
              />
            </label>
          </details>
          <div class="row">
            <button onClick={l.newLink} title="Everyone with the old link loses access">
              New link
            </button>
            <button onClick={() => l.stopShare()}>Stop sharing</button>
          </div>
        </div>
      </Show>

      <Show when={live.role === "guest"}>
        <div class="guest-bar" role="region" aria-label="Review session">
          <span class="dot" style={{ background: live.hostConnected ? "var(--accent)" : "var(--muted)" }} />
          {live.hostConnected ? `With ${live.peers.find((p) => p.id === live.hostId)?.name ?? "presenter"}` : "Waiting for the presenter…"}
          <label>
            <input type="checkbox" checked={live.follow} onChange={(e) => l.setFollow(e.currentTarget.checked)} /> Follow presenter
          </label>
          <input
            class="name"
            value={state.settings.reviewName}
            placeholder="Your name"
            maxLength={40}
            onChange={(e) => setState("settings", "reviewName", e.currentTarget.value)}
            aria-label="Your name"
          />
          <span class="muted small">
            Hold <kbd>L</kbd> to point
          </span>
        </div>
      </Show>

      <Show when={live.ended}>
        <div class="share" role="alert">
          <p>{live.ended}</p>
          <button onClick={() => l.stopShare()}>OK</button>
        </div>
      </Show>
    </>
  );
}
