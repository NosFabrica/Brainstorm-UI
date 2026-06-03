---
name: Vite HMR goes stale after a syntax error
description: Why a correct fix can appear "not working" in the browser, and how to confirm.
---

When an intermediate save introduces a JSX/TS syntax error, Vite logs `Failed to reload <file>` and the browser tab keeps running the last good module. Crucially, **subsequent valid edits may not be hot-applied** even after the syntax is fixed — the dev server/browser can stay on the stale module.

**Why:** a failed HMR update leaves the client out of sync; a plain file save afterward doesn't always force a fresh full module graph for that route.

**How to apply:**
- If a verified-correct fix (tsc clean) "doesn't show up" for the user, restart the `Start application` workflow to force a clean build before assuming the fix is wrong.
- The `screenshot` tool and the `runTest` testing subagent each use their **own** browser session, separate from the user's tab and from each other. A `console.log` you add won't appear in `refresh_all_logs` browser logs unless it's the user's tab. Prefer `runTest` (real interaction) to verify, and restart the workflow first so the test loads current code.
