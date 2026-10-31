# Description

<!--
What does this PR change, and why?
- Which issue does it fix or implement? (write "Closes #123")
- Any breaking change to .sbridge.json, exports or the share protocol?
-->

# Screenshots / recordings

<!-- For UI or geometry changes, show before and after. -->

## Tests

<!-- How did you verify it? Which tests did you add? Which OS/browser did you try? -->

## Checklist

- [ ] `npm run typecheck` and `npm test -- --run` pass locally
- [ ] New behaviour has a test (unit, golden or sample smoke test)
- [ ] Docs updated where relevant (FORMATS.md, INTEROP.md, PLAN.md, CHANGELOG.md `[Unreleased]`)
- [ ] Any new runtime dependency: gzip size stated, lazy-loaded if over 30 KB, licence is Apache/MIT/BSD/ISC/MPL/LGPL
- [ ] No code or knowledge from decompiled vendor software, leaked SDKs or NDAs

<!-- Labels: maintainers label PRs. Contributors can comment `/bot add-label <label>` (see the bot's reply). -->

---

Every PR builds Windows, macOS and Linux installers. To try them, open the **Checks** tab → **Build all** → **Summary**, then download the artifact for your OS at the bottom of the page. You need to be signed in to GitHub.
