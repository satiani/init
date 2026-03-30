---
name: code-tour
description: >
  IMPORTANT: You MUST invoke this skill BEFORE doing any exploration or research yourself when the
  user says "code tour", "give me a tour", "tour of", "walk me through", "show me how X works",
  "explain the codebase", "guided tour", "teach me about", or asks to understand a service's
  architecture or code structure. Do NOT use the Explore agent or read files yourself — invoke
  this skill first. Interactive educational tour using a tmux side pane with nvim, plus optional
  Mermaid architecture/data-flow diagrams rendered to PNG with Mermaid CLI and shown in macOS
  Preview when high-level concepts would help.
disable-model-invocation: false
allowed-tools: Bash(echo *), Bash(tmux *), Bash(nvim *), Bash(sleep *), Bash(wc *), Bash(command -v *), Bash(mktemp *), Bash(mmdc *), Bash(open *), Bash(osascript *), Read, Write, Grep, Glob, Task, mcp__atlassian__search, mcp__atlassian__getConfluencePage
---

# Interactive Code Tour

Give an interactive educational tour explaining code by displaying it in a tmux side pane with nvim and, when it materially helps, rendered Mermaid diagrams in macOS Preview.

## Arguments

`$ARGUMENTS` - The topic, service, or code area to tour (e.g., `apm-services-api`, `authentication flow`, `src/handlers`)

## Teaching style — act like a strong private tutor

Your job is not merely to identify concepts; it is to help the user actually understand them.

### Core teaching rules

1. **Start from the user's surface area first.**
   - Begin with what the user experiences or can observe.
   - Then explain what internal state or protocol causes that behavior.
   - Only then point to the relevant code.

2. **Define terms before using them.**
   - Never casually use repo-specific or backend-specific jargon without immediately translating it.
   - Good pattern: `X, meaning Y in plain English`.
   - Example: `in-context messages, meaning the messages the backend currently treats as active context for the conversation`.

3. **Do not stack unexplained abstractions.**
   - Avoid phrases like `restore pending approvals`, `reconcile context`, or `inspect the in-context tail` unless you immediately explain:
     - what that means in plain English,
     - why it exists,
     - and how it affects the user.

4. **Teach in the order a learner can absorb.**
   For each stop, prefer this sequence:
   - what the user sees / experiences
   - what problem the system is solving
   - the plain-English mechanism
   - the actual code or protocol term
   - why it matters

5. **Connect details to user impact.**
   - Whenever describing a state machine, protocol field, block, tool, or lifecycle, explain what goes wrong for the user if it is missing or wrong.
   - Favor explanations like: `this matters because otherwise the user would see X / lose Y / be unable to resume Z`.

6. **Use fewer ideas, explained better.**
   - Prefer one concept taught clearly over five concepts named quickly.
   - Avoid rapid-fire terminology dumps.

7. **Continuously calibrate to the user.**
   - Infer the user's current understanding from their wording and feedback.
   - If they show confusion or frustration with jargon, slow down immediately and re-explain the current concept in plainer language before moving on.
   - Treat confusion as a teaching failure to fix, not a cue to keep pushing forward.

### Stop-level explanation template

At each diagram or code stop, structure the explanation roughly like this:

1. **What you're looking at**
2. **What this means in plain English**
3. **Why the system needs this**
4. **How this affects the user**
5. **Where this shows up in code**

If you introduce a new technical term, define it on the spot.

### Anti-patterns to avoid

- Do **not** assume the user shares your vocabulary.
- Do **not** say things like `the source of truth is in_context_message_ids` without adding a plain-English translation.
- Do **not** rely on shorthand like `tail`, `hydration`, `reconciliation`, `context window state`, or `approval restoration` unless you unpack them.
- Do **not** move on just because *you* understand it.

### When the user wants understanding before designing an API or extension system

Bias the tour toward **behavioral boundaries**, not just file walkthroughs.

Teach in this order:
1. user-visible behavior
2. client/backend contract
3. state ownership (what lives where)
4. lifecycle and failure/recovery behavior
5. extension points and design constraints
6. relevant code

In these cases, spend less time enumerating files and more time answering:
- what data crosses the boundary?
- who owns that state?
- when is it persisted vs per-turn?
- what can break, and how would the user notice?
- where could an API safely extend the behavior?

## First decision: should the tour start with rendered diagrams?

Before exploring, explicitly decide whether a high-level architecture or data-flow review would help.

**Use rendered Mermaid diagrams when:**
- the user asks for architecture, lifecycles, data flow, high-level concepts, or onboarding context
- the user asks to understand a large system before diving into code
- the user wants a baseline mental model before reviewing a feature branch or diff
- the code has multiple important entities whose relationships are easier to explain visually

**Avoid diagrams when:**
- the user mainly wants to inspect code directly
- the scope is narrow (one file, one function, one bug, one test)
- a diagram would be extraneous ceremony rather than helpful context

Default to **0-3 diagrams** unless the user explicitly asks for more. Each diagram is a full tour stop and counts toward the pacing rules below.

If diagrams are appropriate, good opening choices are:
- architecture overview
- startup lifecycle
- main data flow / request-response loop
- lifecycle of the key domain entities
- branch-delta conceptual diagram (after baseline understanding)

**Hint:** consider whether starting with a high-level review of the architecture or the data flow would be a helpful aid in the code tour. If not, skip diagrams and go straight to code.

## Diagram rendering rules (Mermaid + Preview)

When diagram stops are helpful, follow these rules exactly:

1. **Assume Mermaid CLI is already installed globally as `mmdc`.**
   - Prefer direct `mmdc` invocation.
   - Do **NOT** use `npx`, `bunx`, browser-based rendering, or Chrome DevTools for Mermaid.
   - If `mmdc` is unexpectedly missing, tell the user; do not auto-install it unless they ask.

2. **Render to temporary files only.**
   - Create one unique temp directory for the whole tour, e.g. via:
     ```bash
     mktemp -d /tmp/code-tour.XXXXXX
     ```
   - Store all `.mmd` and `.png` files there so the repo and home directory stay clean.

3. **Use the Write tool for `.mmd` files.**
   - Prefer `Write` over shell heredocs for diagram source files.
   - Use stable per-stop filenames like:
     - `01-architecture.mmd`
     - `01-architecture.png`

4. **Use Mermaid-compatible line breaks.**
   - In node labels, use `<br/>`
   - Do **NOT** use literal `\n` because Mermaid CLI can render that as visible text.

5. **Render to PNG with Mermaid CLI.**
   - Typical command:
     ```bash
     mmdc -i {mmd_file} -o {png_file} -b white -t default -w 1400 -H 1000 -s 2 -q
     ```

6. **Show diagrams in macOS Preview.**
   - Open with:
     ```bash
     open -a /System/Applications/Preview.app {png_file}
     ```
   - The diagram is only considered "rendered" once you have actually created the PNG and opened it.

7. **Close the current tour diagram when the tour moves on.**
   - If you are leaving a diagram stop for **any** later stop — whether another diagram or a code location in nvim — close the current Preview document first.
   - This avoids multiple stale diagrams piling up in Preview.
   - Preview reports temp paths under `/private/tmp/...` even when you created them under `/tmp/...`.
   - Therefore, when closing tour diagrams, match **both** `/tmp/...` and `/private/tmp/...` path prefixes for your tour temp directory.
   - Example pattern:
     ```bash
     osascript <<'APPLESCRIPT'
     tell application "Preview"
       try
         repeat with d in every document
           try
             set p to (path of d as text)
             if p starts with "/private/tmp/code-tour-XYZ/" or p starts with "/tmp/code-tour-XYZ/" then
               close d saving no
             end if
           end try
         end repeat
       end try
     end tell
     APPLESCRIPT
     ```

8. **Diagram pacing is the same as code pacing.**
   - Open at most **one** new diagram per message.
   - After explaining the diagram, stop and ask whether the user wants to continue.
   - Do not open the next diagram or jump back into code without confirmation.

9. **If the user gives feedback on a diagram, fix it before moving on.**
   - Re-render the same stop.
   - Re-open the corrected PNG.
   - Do not proceed until the current diagram is acceptable.

## Setup Phase

1. **Verify tmux session**:
   ```bash
   echo "TMUX=$TMUX"
   ```
   If not in tmux, inform the user they need to run from a tmux session.

2. **Confirm you are inside tmux** by checking `$TMUX_PANE` is set. No need to capture the window ID — `split-pane.sh` resolves the correct window from `$TMUX_PANE` automatically, so navigating away before the split runs cannot misdirect it.

3. **Find code context** (for Datadog services when relevant):
   - Query Atlassian with `mcp__atlassian__search` for documentation about `$ARGUMENTS`
   - Fetch relevant Confluence pages for architecture context
   - Code locations: `~/dd/` (various repos) or `~/go/src/github.com/DataDog/dd-source` (monorepo)

4. **Formulate a tour plan**.

   Build an ordered list of **tour stops**. A stop can be one of two types:

   ### Code stop
   - **file**: absolute path to the file
   - **line**: line number to navigate to
   - **scroll**: `zt` (top) or `zz` (center)
   - **topic**: short label for what this stop covers

   ### Diagram stop
   - **title**: short title shown to the user
   - **topic**: short label for what this stop covers
   - **purpose**: why a diagram is helpful here
   - **kind**: `architecture`, `data_flow`, `lifecycle`, or `branch_delta`
   - **mermaid_source**: the exact Mermaid source to render

   The plan should follow a logical narrative arc. Aim for **5-12 total stops**. Keep diagram stops minimal and purposeful.

   Example internal plan:
   ```
   Stop 1: diagram — agent-first architecture
   Stop 2: diagram — startup lifecycle
   Stop 3: src/index.ts:447 (zt) — CLI entrypoint and startup orchestration
   Stop 4: src/conversation/resolveStartupConversation.ts:61 (zt) — conversation resolution
   Stop 5: src/agent/message.ts:20 (zt) — streaming send path
   Stop 6: src/agent/approval-execution.ts:356 (zt) — approval execution
   ```

5. **Pre-read all code-stop files**.
   Read **all unique files** that appear in code stops using the Read tool. Issue multiple Read calls in parallel where possible (one per file). For large files, read the full file — you need complete contents in context so you already know exact line numbers and can explain any part without delay.

   **CRITICAL**: After this step, every file in your code-stop plan is in context. During the interactive tour you must NEVER re-read these files unless the user explicitly asks you to.

6. **Generate a unique socket path for this tour session**.

   Each tour needs its own nvim server socket so multiple tours can run concurrently. Construct a unique path yourself using the current Unix timestamp and a random suffix, then echo it as a **literal string** (no subshells):
   ```bash
   echo /tmp/nvim-tour-1739700000-42.sock
   ```

   Store the output as `nvim_sock` in your own context. Substitute this literal string into all subsequent nvim commands.

7. **Create side pane with nvim using the server socket** (open the first code stop's file, or the first code file if the tour starts with one or more diagram stops).

   Load and use the **tmux skill** before any tmux operation. Then use it to open a new pane running:
   ```
   bash -c "cd {working_directory} && exec nvim --listen {nvim_sock} {first_code_stop_file}"
   ```
   The tmux skill handles window targeting, layout, and returns focus to the agent's pane automatically. It will print the new pane ID — store that as `$NVIM_PANE`.

8. **Wait for nvim to be ready**:
   ```bash
   sleep 0.2 && [ -S "{nvim_sock}" ] && echo "nvim ready" || echo "ERROR: nvim failed to start"
   ```
   If nvim doesn't start in time, report the error to the user.

9. **Enable line numbers in nvim**:
   ```bash
   nvim --server {nvim_sock} --remote-send '<Esc>:set number<CR>'
   ```

10. **If the plan includes diagram stops, create one temp diagram directory for the whole tour**.
    ```bash
    mktemp -d /tmp/code-tour.XXXXXX
    ```
    Store that literal path as `diagram_dir`.

## Navigation Pattern — code stops

The nvim pane is for the **user** to look at. You should NOT read code through nvim. Instead:
- Use the **Read tool** to read file contents for your own understanding
- Use **nvim `--remote-send`** only to control what the user sees in the pane
- Use **nvim `--remote-expr`** to verify navigation landed correctly (not `tmux capture-pane`)

**Scroll positioning — `zt` vs `zz`**:
- Use `zt` when jumping to the start of a function, struct, class, type definition, or other top-level declaration.
- Use `zz` only when the code both above and below the target line is useful context.

**Navigate within the current file**:
```bash
nvim --server {nvim_sock} --remote-send ':{line_number}<CR>zt'
```

**Open a different file**:
```bash
nvim --server {nvim_sock} --remote-send '<Esc>:e {filepath}<CR>' && nvim --server {nvim_sock} --remote-send ':{line_number}<CR>zt' && nvim --server {nvim_sock} --remote-expr 'expand("%:t") .. ":" .. line(".")'
```

**Verify navigation within the current file**:
```bash
nvim --server {nvim_sock} --remote-send ':{line_number}<CR>zt' && nvim --server {nvim_sock} --remote-expr 'expand("%:t") .. ":" .. line(".")'
```

Replace `zt` with `zz` only when the surrounding context matters.

**Reading file contents during the tour**: all code-stop files were pre-read during setup. Default behavior is to avoid re-reading for low latency. If the user explicitly asks you to re-read files before each step, honor that preference.

**IMPORTANT**: In `--remote-send`, use `<CR>` for Enter and `<Esc>` for Escape, not literal Enter keys.

## Navigation Pattern — diagram stops

When navigating to a diagram stop:
1. Ensure any previous tour diagram in Preview is closed first.
2. Write the stop's Mermaid source into `{diagram_dir}/{NN}-{slug}.mmd`.
3. Render it to `{diagram_dir}/{NN}-{slug}.png` with `mmdc`.
4. Open the PNG in Preview.
5. Tell the user what the diagram shows and why it matters.
6. Stop and wait for confirmation before moving on.
7. When the user confirms they want to continue, close that Preview document before opening the next diagram or switching back to code.

Diagram stops are for **high-level explanation**, not for proving you can draw everything. Keep them focused and practical.

## Pacing Rules

**ABSOLUTE HARD RULE — NEVER VIOLATE**: This is an INTERACTIVE tour. You MUST:

1. After explaining what is on screen — whether that's a Preview diagram or code in nvim — ALWAYS end your message by asking for confirmation before navigating elsewhere.
2. **ONE LOCATION PER MESSAGE**: each message may navigate to at most one new location, where a location is either:
   - one Preview diagram, or
   - one code location in nvim.
3. Never blast through multiple locations without user confirmation between each.
4. Give the user time to read and absorb what is visible.
5. If you find yourself wanting to say "let me also show you X" in the same message — stop and ask first.

## Reading User Selections

Users can highlight code in nvim and ask questions about it.

**User workflow**: select text in visual mode → ask question (while selection is still active)

**To read the selection**:
```bash
nvim --server {nvim_sock} --remote-expr 'join(getline(min([line("v"), line(".")]), max([line("v"), line(".")])), "\n")'
```

This uses `--remote-expr` to read the active visual selection range. `line("v")` is where visual mode started and `line(".")` is the current cursor position. Using `min/max` handles both forward and reverse selections.

**Deictic language preference (`this` / `that`)**:
- During a tour, if the user says phrases like "this", "that", "this block", or "what does this do?", assume they mean the currently highlighted visual selection.
- Read the visual selection first, then answer.
- If no visual selection is active (or the selection is empty), explicitly ask a clarifying question instead of guessing.

## Tour Structure

A typical strong tour looks like:
1. **Optional high-level diagram(s)** — architecture or data flow when helpful
2. **Entry point** — show the startup or main entry
3. **Dependencies / initialization**
4. **Core runtime flow**
5. **Integration points**
6. **Branch changes / diff narrative** (if requested)
7. **Q&A**

If the user wants a branch-vs-base walkthrough, first establish the baseline mental model, then explain how the feature branch changes that model.

## Example Flow

```text
[You] "I’m going to start with one high-level architecture diagram because it will make the rest of the code tour easier."
[Create temp diagram dir, write .mmd, render PNG with mmdc, open in Preview]

[You] "This diagram shows the persistent agent model and the turn loop. ...
       Ready to move to the startup lifecycle?"

[Wait for user: "yes"]
[Close previous Preview diagram, render/open next diagram]

[You] "This startup diagram maps directly onto src/index.ts. ...
       Ready to jump into the code entrypoint?"

[Wait for user: "yes"]
[Close the current Preview diagram]
[Navigate nvim to Stop 3]

[You] "Here’s the CLI entrypoint. ...
       Any questions before we continue?"
```

## Cleanup

When the tour is complete, optionally close nvim and the pane:
```bash
nvim --server {nvim_sock} --remote-send '<Esc>:q<CR>'
```

If you used Preview diagrams, also close any remaining tour diagrams in Preview using the temp-directory path matching rule above.

The tmux pane will close automatically when nvim exits. The temp diagram directory can be left in `/tmp` or removed later if the user asks.
