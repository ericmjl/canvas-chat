# How to use local addresses and move sessions to `localhost`

Canvas-Chat stores everything in your browser: sessions in IndexedDB, settings and
API keys in localStorage. Browsers partition both stores **per origin**, and an
origin is scheme + host + port. `http://localhost:7865`, `http://127.0.0.1:7865`
and `http://0.0.0.0:7865` are therefore three different origins, each with its own
sessions and settings.

Canvas-Chat collapses the loopback spellings to one origin, `localhost`, so you see
one set of data whichever way you type the address.

## What gets redirected

| You open                                   | You land on                  |
| ------------------------------------------ | ---------------------------- |
| `http://127.0.0.1:7865/`                   | `http://localhost:7865/`     |
| `http://0.0.0.0:7865/?session=abc`         | `http://localhost:7865/?session=abc` |
| `https://127.0.0.1:8443/app`               | `https://localhost:8443/app` |
| `http://[::1]:7865/`                       | `http://localhost:7865/`     |
| `http://localhost:7865/`                   | no redirect                  |
| `http://192.168.1.20:7865/` (LAN)          | **never redirected**         |
| `http://mybox.tailnet.ts.net:7865/`        | **never redirected**         |
| `https://<name>.modal.run/`                | **never redirected**         |

Rules the redirect always follows:

- Only the loopback literals listed above are rewritten. LAN IPs, tailnet IPs and
  custom hostnames are left alone, even when the server was started with
  `--host 0.0.0.0` for LAN access.
- Scheme, port, path, query string (`?session=...&multiplayer=true`) and hash are
  preserved. A TLS URL stays TLS.
- The redirect happens at most once per browser tab. If `localhost` does not
  resolve on your machine, going back to `127.0.0.1` in the same tab works.

The CLI opens the browser at `localhost` too when you bind to any loopback
address, so `pixi run dev` and `canvas-chat launch --host 0.0.0.0` both land on
`http://localhost:7865`.

## Move sessions saved under `127.0.0.1`

The first time you open an old address after this change, Canvas-Chat checks for
data under that origin before redirecting.

### If sessions exist there

A **Move to localhost?** dialog appears instead of a silent redirect:

1. Click **Export sessions**. One file, `canvas-chat-sessions-<timestamp>.canvaschat`,
   downloads with every session from the old origin.
2. Click **Continue to localhost**. The app loads on `localhost`.
3. Open the session list and import the file with the usual **Import** button.
   Every session inside is saved under a new ID; the most recently updated one
   opens.

### If nothing is saved there

You are redirected straight away. Nothing is lost because nothing was there.

### What the export does and does not carry

| Carried in the export                       | Not carried                                   |
| ------------------------------------------- | --------------------------------------------- |
| Session content: nodes, edges, positions    | API keys and settings (localStorage)          |
| Tags, matrix cells, code output, carousels  | Live collaborative (CRDT) state in flight     |
| Node versions history                       | Sessions that were never saved                |

Collaborative state for a session lives in its own `crdt-<sessionId>` database.
The dialog counts those separately as "unsaved drafts" (Chromium only) so you
know they exist, but they cannot be exported. Save a session before you move if
you need its in-flight edits.

Settings and API keys are a deliberate exclusion: they include Copilot OAuth
tokens and provider secrets, which must not travel in a downloaded file. Re-enter
them once under `localhost`.

## Skip the move for one tab

The once-per-tab guard lives in `sessionStorage` under
`canvas-chat-loopback-redirected`. Opening `127.0.0.1` in a **new tab** always
offers the move again; reusing the tab after a redirect does not.

## Troubleshoot

**The dialog says "0 sessions" but I had chats.**
They are probably under a different port, or you opened the app in another
browser profile. Each profile has its own storage.

**I clicked Continue without exporting.**
Nothing was deleted. Open a new tab on the old address and the dialog appears
again.

**I want to keep using `127.0.0.1`.**
The redirect is a hard rule of the app, not a setting. The old data is not
deleted; it simply does not show under `localhost`.

## Where this lives in the code

- `src/canvas_chat/static/js/origin-normalization.js`: the hostname list, the URL
  rewrite, and the once-per-tab decision (pure functions, unit-tested).
- `src/canvas_chat/static/js/loopback-migration.js`: the boot-time flow, the data
  count, and the dialog wiring.
- `src/canvas_chat/__main__.py`: `browser_url_for()` for the CLI-opened browser.
