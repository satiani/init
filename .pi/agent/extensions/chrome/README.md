<!-- vim: set nowrap: -->

# pi-chrome

Chrome browser control for [pi](https://pi.dev), as a native extension. Registers 29 DevTools tools (clicking,
snapshots, network, Lighthouse, performance traces, heap snapshots) directly with `pi.registerTool()` — there is no MCP
server, transport, or JSON-RPC in this path. The
[`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) package is used strictly as a library for
its tool implementations.

Two things make it different from pointing pi at `chrome-devtools-mcp` over MCP:

1. **One Chrome permission prompt, not one per session.** A shared broker process owns the single approved CDP
   connection; every pi session talks to it over a unix socket.
2. **Screenshots you did not have to ask for.** Tool results carry a frame when the page visibly changed or when the
   call failed, so the model stops burning a turn on `take_screenshot` after every action.

## Why the broker exists

Chrome shows an "Allow remote debugging?" dialog for **every** new CDP connection and will not persist approval
([chrome-devtools-mcp#825](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/825), closed as not planned). pi
runs one process per session and people keep several open, so a per-session CDP connection means a dialog per session.
Exactly one broker means one dialog per Chrome restart, however many sessions are running.

```
                                ┌────────────────────┐
                                │    pi session A    │
                                └────────────────────┘
                                  │
                                  │ JSON over
                                  │ unix socket
                                  ∨
┌──────────────┐                ┌────────────────────┐                ┌──────────────┐
│              │  JSON over     │     broker.mjs     │  JSON over     │              │
│ pi session C │  unix socket   │    one process     │  unix socket   │ pi session B │
│              │ ─────────────> │   holds the lock   │ <───────────── │              │
└──────────────┘                └────────────────────┘                └──────────────┘
                                  │
                                  │ ONE CDP
                                  │ connection
                                  ∨
                                ┌────────────────────┐
                                │       Chrome       │
                                │ one "Allow" prompt │
                                │    per restart     │
                                └────────────────────┘
```

The broker is started lazily on the first tool call and outlives the pi sessions that use it. Tool schemas are cached to
`tools.json`, so startup registers all tools without waking the broker or touching Chrome; the permission prompt happens
on first real use.

## Install

Requires Node 20+ and a running Chrome (stable channel by default). The extension attaches to your **real** browser
profile — logged-in sessions, extensions and all.

```bash
git clone <this-repo> ~/.pi/agent/extensions/chrome
cd ~/.pi/agent/extensions/chrome && npm ci
```

pi auto-discovers `~/.pi/agent/extensions/*/index.ts`. Restart pi (or `/reload`) and run `/chrome status`.

`node_modules` is not committed, and the extension refuses to register tools without it rather than silently offering
zero tools — `/chrome` will tell you the exact fix if you skip `npm ci`.

## Tools

`*` marks tools that participate in auto-screenshot.

| Category    | Tools                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| input       | `click*` `drag*` `fill*` `fill_form*` `handle_dialog*` `hover*` `press_key*` `type_text*` `upload_file*`              |
| navigation  | `close_page*` `list_pages` `navigate_page*` `new_page*` `select_page*` `wait_for*`                                    |
| debugging   | `evaluate_script*` `get_console_message` `lighthouse_audit` `list_console_messages` `take_screenshot` `take_snapshot` |
| emulation   | `emulate*` `resize_page*`                                                                                             |
| network     | `get_network_request` `list_network_requests`                                                                         |
| performance | `performance_analyze_insight` `performance_start_trace` `performance_stop_trace`                                      |
| memory      | `take_heapsnapshot`                                                                                                   |

Plus one tool this extension adds itself:

**`chrome_batch`** runs up to 20 tools back-to-back in a single call. Browser work is dominated by round trips, and
sequences like _navigate → wait_for → take_snapshot_ are decided up front, so paying a model turn per step is pure
waste. Every step is schema-validated before any of them run, steps execute atomically against other sessions, and an
aborted batch comes back with a fresh snapshot attached — the dominant batch failure is a stale `uid`, and the retry
needs current ones.

## Auto-screenshot

The model cannot see the page. Making it call `take_screenshot` after every action is slow and expensive, and telling it
not to does not work — measured across three sessions, `take_screenshot` held steady at 17/18/20% of all browser calls
before and after the tool descriptions asked it to stop. So the decision is made for it, on two rules:

- **The page changed.** After a visual tool, a cheap luma fingerprint is compared against the last frame _this session_
  was shown. A screenshot is attached only if the page actually moved. When it did not, the result says so — "the click
  did nothing" is the signal the caller wanted, and it costs one line of text instead of ~700 tokens of image.
- **The call failed.** Attach unconditionally: a failure is exactly the moment the caller's model of the page is known
  to be wrong. Repeat failures against an unchanged page are deduped, since the first frame already showed it.

Both decisions happen broker-side, under the lock that guarantees the frame belongs to _this_ action and not to another
session's call. Baselines are per pi session, because "has this caller already seen the page?" is a fact about one
conversation, not about the shared browser.

Notable properties, each of which exists because the naive version was wrong:

- Change detection uses a **32×32 grid of mean luma**, not a perceptual hash. dHash/aHash are built to ignore small
  changes; an inline validation error or a corner toast _is_ a small change and is the whole reason you wanted to look.
- Fingerprints are captured until two agree, so a frame is never taken mid-transition. Pages that never settle
  (spinners, video) set a **noise floor** that raises the change threshold, instead of reporting "changed" forever.
- Captures go **straight to CDP** with `captureBeyondViewport: false`. Puppeteer forces that flag on whenever a clip is
  supplied, which relayouts the live page twice per capture — measured 22ms and no flicker versus 43ms and continuous
  flicker.
- A plain `take_screenshot` is served on the same path, so it comes back inline at ~1,300 tokens instead of upstream's
  Retina PNG, which trips its own inline limit and answers with a file path the model then has to read back.
- Every failure path fails open. This rides on a tool call that already succeeded and must never be able to turn that
  into a failure, or to hang it.

Per-session control:

```
/chrome autoshot          # show current mode
/chrome autoshot on       # changed-page + failures (default)
/chrome autoshot errors   # failures only
/chrome autoshot off
```

## Commands

| Command            | Effect                                                              |
| ------------------ | ------------------------------------------------------------------- |
| `/chrome status`   | Broker pid, Chrome connection, tool count, auto-screenshot counters |
| `/chrome restart`  | Restart the broker (Chrome will ask "Allow remote debugging?" once) |
| `/chrome stop`     | Stop the broker; it restarts on the next tool call                  |
| `/chrome tools`    | List registered tools                                               |
| `/chrome autoshot` | Get or set auto-screenshot mode for this session                    |

`broker.mjs` is also a CLI, which is the fastest way to debug it outside pi:

```bash
node broker.mjs status|ensure|restart|stop|tools
tail -f broker.log
```

## Configuration

All optional. Set them in the environment pi runs in.

| Variable                     | Default  | Meaning                                                        |
| ---------------------------- | -------- | -------------------------------------------------------------- |
| `PI_CHROME_CHANNEL`          | `stable` | Chrome channel to attach to: `stable`, `beta`, `canary`, `dev` |
| `PI_CHROME_AUTOSHOT`         | `on`     | Startup mode: `on`, `errors`, `off`                            |
| `PI_CHROME_AUTOSHOT_CELL`    | `24`     | One grid cell moving this much (0–255) counts as a change      |
| `PI_CHROME_AUTOSHOT_MEAN`    | `2`      | Or this much average movement across all cells                 |
| `PI_CHROME_AUTOSHOT_SETTLE`  | `6`      | Max cell delta at which two frames count as identical          |
| `PI_CHROME_AUTOSHOT_GRID`    | `32`     | Fingerprint grid size                                          |
| `PI_CHROME_AUTOSHOT_FPWIDTH` | `160`    | Capture width the fingerprint is derived from                  |
| `PI_CHROME_AUTOSHOT_WIDTH`   | `1000`   | Max width in device px of an auto-attached frame               |
| `PI_CHROME_AUTOSHOT_QUALITY` | `55`     | JPEG quality of an auto-attached frame                         |
| `PI_CHROME_AUTOSHOT_BUDGET`  | `6000`   | Hard ceiling in ms on the whole auto-screenshot detour         |
| `PI_CHROME_SHOT_WIDTH`       | `1400`   | Max width for an explicit `take_screenshot`                    |
| `PI_CHROME_SHOT_QUALITY`     | `72`     | JPEG quality for an explicit `take_screenshot`                 |

## Security

Read this before installing. pi extensions run with your full permissions, and this one hands a language model the keys
to your logged-in browser.

- **It drives your real Chrome profile.** Any site you are signed into is reachable by any tool call the model makes.
  There is no sandbox and no per-action confirmation.
- **`allowUnrestrictedPaths` is on.** Screenshots, traces and heap snapshots can be written anywhere your user can
  write, not just to a temp directory. Change `SERVER_ARGS` in `broker.mjs` if that is not acceptable to you.
- **`evaluate_script` is arbitrary JS** in the context of whatever page is selected.
- Network header redaction (`redactNetworkHeaders`) is on, and usage statistics are off.
- The broker socket is a filesystem socket in the extension directory, so it is reachable by anything running as your
  user.

## Tests

```bash
npm test        # pure helpers: PNG decoder, fingerprint, change detection. No browser.
npm run test:e2e   # drives the real broker and a real Chrome
```

The unit test encodes the same pixels once per PNG filter type and requires all five to decode identically — the
unfilter step is hand-rolled, because Node ships zlib but no image codec and pulling in a decoder to compare two
thumbnails is not worth it.

The e2e test needs Chrome running and will trigger the permission prompt if the broker is not already connected. It
asserts the rules end to end (a no-op click stays quiet, a corner toast attaches, failures dedupe, sessions do not
suppress each other) and includes a flicker regression check: the page counts its own relayouts, and the pre-CDP
behaviour scored ~26 across five calls where the fixed path scores ≤3.

## Known limitations

- **The broker deep-imports `chrome-devtools-mcp`'s build output**, which is private API. The dependency is pinned to an
  exact version for that reason. Upgrades need a check that
  `build/src/{browser,McpContext,ToolHandler,tools/tools,utils/Mutex}.js` still exist and behave; a mismatch surfaces as
  a startup error naming the fix, not a mystery.
- **Runtime state (socket, pid, log, schema cache) lives in the extension directory.** The socket path is therefore
  per-install, not per-machine, so two installs of this extension (say one at user scope and one project-local) run two
  brokers and Chrome prompts twice. Install it once. A reinstall wipes the schema cache, which is rebuilt on the next
  broker start and costs nothing.
- **`broker.log` is append-only and never rotated.** It only grows when something goes wrong, but nothing truncates it.
- **A renderer paused at a `debugger` statement stays paused.** The broker survives the resulting internal errors rather
  than dying (it holds the one approved CDP connection, so its death is worse than any single failed call), and surfaces
  the count in `/chrome status`. Affected tool calls time out.

## Credits

Tool implementations come from [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
(Apache-2.0), used as a library. Everything else — the broker, the batch tool, auto-screenshot, and the output safety
boundary — is specific to this extension.
