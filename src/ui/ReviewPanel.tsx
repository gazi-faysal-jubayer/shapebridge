import { For, Show } from "solid-js";
import MessageSquarePlus from "lucide-solid/icons/message-square-plus";
import PenLine from "lucide-solid/icons/pen-line";
import Check from "lucide-solid/icons/check";
import { setState, state } from "../state/store";
import * as l from "../live";
import { live } from "../live";

export function ReviewPanel() {
  return (
    <div class="review">
      <div class="review-actions">
        <button
          onClick={() => setState("tool", "comment")}
          classList={{ on: state.tool === "comment" }}
          title="Click the model to pin a comment"
        >
          <MessageSquarePlus size={15} /> Pin comment
        </button>
        <button onClick={l.startMarkup} classList={{ on: state.tool === "markup" }} title="Draw on the view, then post it">
          <PenLine size={15} /> Markup
        </button>
      </div>
      <Show when={state.tool === "comment" && !live.draft}>
        <p class="muted small">Click the model where the comment belongs. Esc to cancel.</p>
      </Show>
      <Show when={state.tool === "markup" && live.draft}>
        <p class="muted small">Draw on the view, then write a note in the box and post it.</p>
      </Show>
      <Show
        when={live.comments.length}
        fallback={<p class="muted">No comments yet. Pins and markups are shared live with everyone in the review.</p>}
      >
        <ol class="comments">
          <For each={live.comments}>
            {(cm, i) => (
              <li classList={{ resolved: cm.resolved, active: live.active === cm.id }}>
                <button class="head" onClick={() => l.focusComment(cm.id)} title="Show this view">
                  <span class="dot" style={{ background: cm.color }}>
                    {i() + 1}
                  </span>
                  <b>{cm.author}</b>
                  <Show when={cm.strokes.length}>
                    <span class="tag">markup</span>
                  </Show>
                </button>
                <button
                  class="ghost resolve"
                  onClick={() => l.toggleResolved(cm.id)}
                  aria-label={cm.resolved ? "Reopen" : "Resolve"}
                  title={cm.resolved ? "Reopen" : "Resolve"}
                >
                  <Check size={14} />
                </button>
                <p>{cm.text || <i class="muted">markup</i>}</p>
                <For each={cm.replies}>
                  {(r) => (
                    <p class="reply">
                      <b>{r.author}:</b> {r.text}
                    </p>
                  )}
                </For>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem("reply") as HTMLInputElement;
                    l.reply(cm.id, input.value);
                    input.value = "";
                  }}
                >
                  <input name="reply" placeholder="Reply…" maxLength={2000} aria-label={`Reply to comment ${i() + 1}`} />
                </form>
              </li>
            )}
          </For>
        </ol>
        <button class="ghost" onClick={l.exportReview}>
          Export review (Markdown)
        </button>
      </Show>
    </div>
  );
}
