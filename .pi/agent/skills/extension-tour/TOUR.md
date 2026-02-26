# Pi Extension Examples — Complete Tour Guide

> Source directory: `~/.volta/tools/image/packages/@mariozechner/pi-coding-agent/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/`

This document provides extensive documentation on every example extension bundled with pi. Extensions are grouped by category. Each entry includes what it does, how to use it, what APIs it demonstrates, and what patterns you can learn from it.

---

## Table of Contents

- [1. Safety & Permission Gates](#1-safety--permission-gates)
- [2. Custom Tools](#2-custom-tools)
- [3. Commands & Input Processing](#3-commands--input-processing)
- [4. System Prompt & Compaction](#4-system-prompt--compaction)
- [5. Git Integration](#5-git-integration)
- [6. UI: Status, Widgets & Footers](#6-ui-status-widgets--footers)
- [7. UI: Custom Editors](#7-ui-custom-editors)
- [8. UI: Custom Components & Overlays](#8-ui-custom-components--overlays)
- [9. Session Metadata & State](#9-session-metadata--state)
- [10. Remote Execution & Sandboxing](#10-remote-execution--sandboxing)
- [11. Custom Providers](#11-custom-providers)
- [12. Inter-Extension Communication](#12-inter-extension-communication)
- [13. Games](#13-games)
- [14. Complex / Multi-Feature Extensions](#14-complex--multi-feature-extensions)

---

## 1. Safety & Permission Gates

These extensions intercept tool calls to block or confirm dangerous operations before they execute.

### 1.1 `permission-gate.ts`

**What it does:** Prompts for user confirmation before running potentially dangerous bash commands. Matches patterns like `rm -rf`, `sudo`, and `chmod 777`. In non-interactive mode, blocks outright.

**Activation:** `pi -e ./permission-gate.ts` or copy to `~/.pi/agent/extensions/`

**Key APIs:**
- `pi.on("tool_call")` — intercepts bash tool calls
- `ctx.ui.select()` — shows Yes/No confirmation
- `return { block: true, reason: "..." }` — blocks the tool call
- `ctx.hasUI` — checks if interactive mode is available

**Pattern taught:** Basic tool_call event interception with conditional blocking. The simplest possible safety gate.

**Complexity:** ⭐ Beginner

---

### 1.2 `protected-paths.ts`

**What it does:** Blocks `write` and `edit` operations to sensitive paths: `.env`, `.git/`, and `node_modules/`. Shows a warning notification when blocked.

**Activation:** `pi -e ./protected-paths.ts` or copy to `~/.pi/agent/extensions/`

**Key APIs:**
- `pi.on("tool_call")` — intercepts write/edit calls
- `ctx.ui.notify()` — shows a non-blocking warning
- `return { block: true, reason: "..." }` — blocks the operation

**Pattern taught:** Path-based access control. Check `event.toolName` and `event.input.path` to selectively block operations.

**Complexity:** ⭐ Beginner

---

### 1.3 `confirm-destructive.ts`

**What it does:** Prompts for confirmation before destructive session actions — clearing a session (`/new`) or switching sessions (`/resume`). Also confirms before forking.

**Activation:** `pi -e ./confirm-destructive.ts`

**Key APIs:**
- `pi.on("session_before_switch")` — intercepts `/new` and `/resume`
- `pi.on("session_before_fork")` — intercepts `/fork`
- `event.reason` — distinguishes "new" vs "resume"
- `ctx.ui.confirm()` / `ctx.ui.select()` — user dialogs
- `return { cancel: true }` — cancels the session action

**Pattern taught:** Session lifecycle interception using `session_before_*` events. These events support `{ cancel: true }` returns to abort the action.

**Complexity:** ⭐ Beginner

---

### 1.4 `dirty-repo-guard.ts`

**What it does:** Prevents session changes (new, switch, fork) when there are uncommitted git changes. Counts changed files and asks the user to confirm or commit first.

**Activation:** `pi -e ./dirty-repo-guard.ts`

**Key APIs:**
- `pi.exec("git", ["status", "--porcelain"])` — runs git command
- `pi.on("session_before_switch")` / `pi.on("session_before_fork")` — intercepts actions
- `ctx.ui.select()` — asks user to proceed or commit first

**Pattern taught:** Combining `pi.exec()` for shell commands with session event interception. Shows how to extract a reusable async helper function (`checkDirtyRepo`) used by multiple event handlers.

**Complexity:** ⭐⭐ Beginner+

---

### 1.5 `sandbox/` (directory)

**What it does:** OS-level sandboxing for bash commands using `@anthropic-ai/sandbox-runtime`. Enforces filesystem read/write restrictions and network domain allowlists at the OS level (sandbox-exec on macOS, bubblewrap on Linux). Configurable via `~/.pi/agent/sandbox.json` or `.pi/sandbox.json`.

**Activation:** `pi -e ./sandbox`

**Key APIs:**
- `createBashTool()` with custom `BashOperations` — overrides bash execution
- `pi.registerFlag("no-sandbox")` — CLI flag to disable
- Config file loading and merging (global + project)
- `pi.on("session_start")` — initialize sandbox config

**Pattern taught:** OS-level process sandboxing with configurable policies. Shows how to use external npm dependencies (`@anthropic-ai/sandbox-runtime`) in extensions and override the bash tool's execution layer.

**Complexity:** ⭐⭐⭐⭐ Advanced

---

## 2. Custom Tools

These extensions register new tools that the LLM can call.

### 2.1 `hello.ts`

**What it does:** The absolute minimal custom tool. Registers a `hello` tool that takes a `name` parameter and returns a greeting.

**Activation:** `pi -e ./hello.ts`

**Key APIs:**
- `pi.registerTool()` — registers a tool
- `Type.Object()` / `Type.String()` — parameter schema
- Return `{ content: [...], details: {...} }` — tool result

**Pattern taught:** The simplest possible tool registration. Start here to understand the anatomy of a custom tool.

**Complexity:** ⭐ Beginner

---

### 2.2 `question.ts`

**What it does:** Registers a `question` tool that the LLM can call to ask the user a question with selectable options. Features a full custom UI with an options list, a "Type something" freeform option with inline editor, keyboard navigation, and custom `renderCall`/`renderResult`.

**Activation:** `pi -e ./question.ts`

**Key APIs:**
- `pi.registerTool()` with `execute`, `renderCall`, `renderResult`
- `ctx.ui.custom()` — full custom TUI component
- `Editor` component from `@mariozechner/pi-tui` — inline text editor
- `matchesKey()` / `Key.escape` / `Key.up` / `Key.down` — keyboard handling
- `Text` component — rendering
- `truncateToWidth()` — safe line truncation

**Pattern taught:** Building interactive tools with full custom UI. Shows how to create a component with multiple modes (options list vs text input), keyboard navigation, and custom rendering for both the tool call and result.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 2.3 `questionnaire.ts`

**What it does:** Multi-question tool with a tab bar interface. Supports single questions (simple list) or multiple questions (tabbed navigation with a Submit tab). Each question has options, optional descriptions, and an optional "Type something" freeform entry.

**Activation:** `pi -e ./questionnaire.ts`

**Key APIs:**
- `ctx.ui.custom()` — complex multi-mode TUI
- `Editor` component — inline text editing
- Tab navigation with `Key.tab` / `Key.shift("tab")`
- `renderCall` / `renderResult` — custom rendering
- `Type.Array()` / `Type.Optional()` — complex parameter schemas

**Pattern taught:** The most complex custom UI tool. Demonstrates multi-screen navigation (tabs), state management across questions, submit validation ("all answered" check), and how to build wizard-style interactive flows.

**Complexity:** ⭐⭐⭐⭐ Advanced

---

### 2.4 `todo.ts`

**What it does:** A full todo list manager with both a tool (for the LLM) and a command (for the user). Supports list, add, toggle, and clear actions. State persists across session restarts and respects branching.

**Activation:** `pi -e ./todo.ts`

**Key APIs:**
- `pi.registerTool()` — `todo` tool with `StringEnum` for actions
- `pi.registerCommand("todos")` — user-facing `/todos` command
- `ctx.ui.custom()` — readonly display component
- Session reconstruction via `ctx.sessionManager.getBranch()`
- `pi.on("session_start/switch/fork/tree")` — state reconstruction on all session events
- `details` in tool results — state persistence pattern

**Pattern taught:** **The canonical state management pattern.** Store full state snapshots in `details` of every tool result. Reconstruct by scanning branch entries on session events. This ensures correct state on fork/branch navigation.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 2.5 `tool-override.ts`

**What it does:** Overrides the built-in `read` tool. Adds access logging to a file and blocks reads of sensitive paths (`.env`, `.ssh/`, `.aws/`, credentials files). Includes a `/read-log` command to view recent access entries.

**Activation:** `pi -e ./tool-override.ts`

**Key APIs:**
- `pi.registerTool({ name: "read" })` — same name overrides built-in
- `appendFileSync()` — access logging
- Regex-based path blocking
- `pi.registerCommand("read-log")` — companion command
- No `renderCall`/`renderResult` — falls back to built-in renderer automatically

**Pattern taught:** How to override built-in tools for auditing/access control while keeping the original rendering. Shows that if you don't provide custom renderers, the built-in renderer handles it.

**Complexity:** ⭐⭐ Beginner+

---

### 2.6 `built-in-tool-renderer.ts`

**What it does:** Overrides all four core tools (read, bash, edit, write) with compact custom renderers while delegating execution to the originals. Shows line counts, exit codes, diff stats, and file sizes in collapsed view; full output in expanded view.

**Activation:** `pi -e ./built-in-tool-renderer.ts`

**Key APIs:**
- `createReadTool()` / `createBashTool()` / `createEditTool()` / `createWriteTool()` — original tool factories
- `renderCall(args, theme)` / `renderResult(result, { expanded, isPartial }, theme)` — custom rendering
- `BashToolDetails`, `ReadToolDetails`, `EditToolDetails` — typed detail access
- `expanded` flag — user toggled with Ctrl+O
- `isPartial` flag — streaming/in-progress

**Pattern taught:** The complete guide to custom tool rendering. Shows every render scenario: streaming (isPartial), collapsed vs expanded, error states, and how to delegate execution while replacing the display.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 2.7 `minimal-mode.ts`

**What it does:** A "minimal display mode" that overrides all seven built-in tools (read, bash, edit, write, grep, find, ls). In collapsed mode, shows only the tool call with no output. In expanded mode, shows full output. Demonstrates how a toggle between "minimal" and "standard" views could work.

**Activation:** `pi -e ./minimal-mode.ts`

**Key APIs:**
- All seven `create*Tool()` factories
- `renderResult` returning empty `Text` in collapsed mode
- Path shortening with `~` for home directory

**Pattern taught:** Full override of all built-in tools for a unified minimal display. Use Ctrl+O to toggle between minimal (collapsed) and full (expanded) views.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 2.8 `truncated-tool.ts`

**What it does:** Wraps ripgrep (`rg`) as a custom tool with proper output truncation. Demonstrates the built-in truncation utilities (`truncateHead`, `DEFAULT_MAX_BYTES`, `DEFAULT_MAX_LINES`), writing full output to temp files, and informing the LLM about truncation.

**Activation:** `pi -e ./truncated-tool.ts`

**Key APIs:**
- `truncateHead()` — keep first N lines/bytes
- `DEFAULT_MAX_BYTES` (50KB) / `DEFAULT_MAX_LINES` (2000)
- `formatSize()` — human-readable sizes
- `mkdtempSync()` / `writeFileSync()` — temp file for full output
- Custom `renderCall` / `renderResult` with truncation warnings

**Pattern taught:** **The output truncation pattern.** Every custom tool that can produce large output MUST truncate. This is the reference implementation showing how to do it correctly.

**Complexity:** ⭐⭐ Beginner+

---

### 2.9 `antigravity-image-gen.ts`

**What it does:** Generates images via Google Antigravity's image models (gemini-3-pro-image, imagen-3). Returns images as base64 tool result attachments for inline terminal rendering. Supports multiple save modes (none, project, global, custom directory). Configurable via env vars or JSON config files.

**Activation:** `pi -e ./antigravity-image-gen.ts` (requires Google OAuth via `/login`)

**Key APIs:**
- `pi.registerProvider()` — registers google-antigravity provider with OAuth
- Image content in tool results: `{ type: "image", source: { type: "base64", ... } }`
- Config file loading (global + project JSON)
- Environment variable fallbacks

**Pattern taught:** Image generation tools, OAuth provider registration, multi-source configuration (env vars → config files → tool params), and returning image content from tools.

**Complexity:** ⭐⭐⭐⭐ Advanced

---

## 3. Commands & Input Processing

These extensions register slash commands or transform user input.

### 3.1 `commands.ts`

**What it does:** Provides a `/commands` command that lists all available slash commands grouped by source (extension, prompt, skill). Supports filtering by source and viewing the source file path. Demonstrates `getArgumentCompletions` for tab-completion.

**Activation:** `pi -e ./commands.ts`

**Key APIs:**
- `pi.getCommands()` — list all registered slash commands
- `getArgumentCompletions(prefix)` — tab-completion for command arguments
- `ctx.ui.select()` / `ctx.ui.confirm()` — interactive browsing

**Pattern taught:** Introspecting pi's command system. Shows how extensions can query what other extensions, skills, and prompt templates have registered.

**Complexity:** ⭐⭐ Beginner+

---

### 3.2 `send-user-message.ts`

**What it does:** Demonstrates `pi.sendUserMessage()` with three commands: `/ask` (send when idle), `/steer` (interrupt streaming with a steering message), and `/followup` (queue after current processing). Also shows structured content arrays.

**Activation:** `pi -e ./send-user-message.ts`

**Key APIs:**
- `pi.sendUserMessage(text)` — send as if user typed it
- `pi.sendUserMessage(text, { deliverAs: "steer" })` — interrupt streaming
- `pi.sendUserMessage(text, { deliverAs: "followUp" })` — queue for after
- `pi.sendUserMessage([...content])` — structured content (text + images)
- `ctx.isIdle()` — check if agent is streaming

**Pattern taught:** The three message delivery modes (immediate, steer, followUp) and when to use each. Essential for extensions that need to inject messages programmatically.

**Complexity:** ⭐⭐ Beginner+

---

### 3.3 `input-transform.ts`

**What it does:** Intercepts user input via the `input` event. Transforms `?quick <question>` into a brief-response prompt, handles `ping` and `time` commands instantly without the LLM.

**Activation:** `pi -e ./input-transform.ts`

**Key APIs:**
- `pi.on("input")` — intercepts raw user input
- `return { action: "transform", text: "..." }` — rewrite input
- `return { action: "handled" }` — respond without LLM
- `return { action: "continue" }` — pass through unchanged
- `event.source` — "interactive", "rpc", or "extension"

**Pattern taught:** The input event pipeline. Shows all three response types (transform, handled, continue) and how to check the input source to avoid infinite loops from extension-injected messages.

**Complexity:** ⭐⭐ Beginner+

---

### 3.4 `inline-bash.ts`

**What it does:** Expands `!{command}` patterns inline within prompts. E.g., `"What's in !{pwd}?"` becomes `"What's in /Users/you?"`. Executes commands, replaces patterns with output, and shows a summary notification of expansions.

**Activation:** `pi -e ./inline-bash.ts`

**Key APIs:**
- `pi.on("input")` — intercepts input before LLM
- `pi.exec("bash", ["-c", command])` — execute inline commands
- `return { action: "transform", text: result, images: event.images }` — replace with expanded text
- Regex matching with `!{...}` pattern

**Pattern taught:** Complex input transformation with shell command expansion. Shows regex-based pattern matching, async command execution within input handlers, and error handling for failed commands.

**Complexity:** ⭐⭐ Beginner+

---

### 3.5 `handoff.ts`

**What it does:** `/handoff <goal>` transfers conversation context to a new focused session. Uses the LLM to generate a concise prompt summarizing the current conversation for the new task, shows it in an editor for review, then creates a new session with the prompt pre-loaded.

**Activation:** `pi -e ./handoff.ts`

**Key APIs:**
- `pi.registerCommand("handoff")` — registers the command
- `ctx.sessionManager.getBranch()` — get current conversation
- `convertToLlm()` / `serializeConversation()` — convert messages to text
- `complete()` from `@mariozechner/pi-ai` — call LLM for summary
- `BorderedLoader` — spinner UI during generation
- `ctx.ui.editor()` — multi-line editing of generated prompt
- `ctx.newSession({ parentSession })` — create linked session
- `ctx.ui.setEditorText()` — pre-fill editor in new session

**Pattern taught:** The "session handoff" pattern. Shows how to serialize a conversation, call the LLM independently for a task, let the user edit the result, and create a new session with context.

**Complexity:** ⭐⭐⭐⭐ Advanced

---

### 3.6 `qna.ts`

**What it does:** `/qna` extracts questions from the last assistant message using the LLM, then loads them into the editor as a Q&A template for the user to fill in and submit.

**Activation:** `pi -e ./qna.ts`

**Key APIs:**
- `ctx.sessionManager.getBranch()` — find last assistant message
- `complete()` from `@mariozechner/pi-ai` — extract questions
- `BorderedLoader` — spinner during extraction
- `ctx.ui.setEditorText()` — load Q&A template into editor

**Pattern taught:** The "prompt generator" pattern: (1) process context, (2) show spinner, (3) load result into editor for user submission. Useful for any extension that generates prompts from context.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 3.7 `summarize.ts`

**What it does:** `/summarize` generates a conversation summary using GPT-5.2 and displays it in a custom bordered Markdown viewer with proper formatting.

**Activation:** `pi -e ./summarize.ts`

**Key APIs:**
- `getModel("openai", "gpt-5.2")` — use a specific model
- `complete()` — call LLM for summary
- `ctx.modelRegistry.getApiKey()` — resolve API key
- `DynamicBorder` — bordered container component
- `Markdown` component — render markdown in TUI
- `getMarkdownTheme()` — markdown styling
- `Container` — compose multiple components

**Pattern taught:** Using a different model for a task, building a rich read-only display with the TUI component system (Container + Border + Markdown + Text), and the Markdown rendering component.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 3.8 `timed-confirm.ts`

**What it does:** Three commands demonstrating timed dialogs: `/timed` (5s countdown confirm), `/timed-select` (10s countdown select), `/timed-signal` (manual AbortSignal approach).

**Activation:** `pi -e ./timed-confirm.ts`

**Key APIs:**
- `ctx.ui.confirm("Title", "Body", { timeout: 5000 })` — auto-dismiss with countdown
- `ctx.ui.select("Title", options, { timeout: 10000 })` — timed select
- `ctx.ui.confirm("Title", "Body", { signal })` — manual AbortSignal control

**Pattern taught:** Auto-dismissing dialogs for non-blocking workflows. The `timeout` option adds a live countdown display. The `signal` approach gives more control to distinguish timeout from user cancel.

**Complexity:** ⭐ Beginner

---

### 3.9 `reload-runtime.ts`

**What it does:** Adds `/reload-runtime` command and a `reload_runtime` tool the LLM can call. The tool queues a follow-up user command because tools run with `ExtensionContext` (no `ctx.reload()`), while commands run with `ExtensionCommandContext` (has `ctx.reload()`).

**Activation:** `pi -e ./reload-runtime.ts`

**Key APIs:**
- `ctx.reload()` — reload all extensions/skills/prompts/themes
- `pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" })` — tool-to-command bridge
- The distinction between `ExtensionContext` (tools) and `ExtensionCommandContext` (commands)

**Pattern taught:** The tool → command handoff pattern for operations only available in commands. Essential when tools need to trigger session-level operations.

**Complexity:** ⭐⭐ Beginner+

---

### 3.10 `shutdown-command.ts`

**What it does:** Adds `/quit` command plus two tools (`finish_and_exit`, `deploy_and_exit`) that demonstrate graceful shutdown. Shutdown is deferred until the agent becomes idle.

**Activation:** `pi -e ./shutdown-command.ts`

**Key APIs:**
- `ctx.shutdown()` — request graceful exit
- `onUpdate?.()` — stream progress in tools
- Deferred shutdown behavior (waits for idle)

**Pattern taught:** Graceful shutdown from commands and tools. Shows that `ctx.shutdown()` doesn't exit immediately — it waits for the current response to complete.

**Complexity:** ⭐ Beginner

---

## 4. System Prompt & Compaction

These extensions modify the system prompt or customize how conversation compaction works.

### 4.1 `pirate.ts`

**What it does:** `/pirate` toggles pirate mode. When enabled, appends instructions to the system prompt making the agent speak like a pirate while still completing tasks correctly.

**Activation:** `pi -e ./pirate.ts`

**Key APIs:**
- `pi.on("before_agent_start")` — modify system prompt
- `return { systemPrompt: event.systemPrompt + "..." }` — append to system prompt
- `pi.registerCommand("pirate")` — toggle command

**Pattern taught:** Dynamic system prompt modification. The `before_agent_start` event fires before every agent turn, so you can conditionally modify the system prompt based on extension state.

**Complexity:** ⭐ Beginner

---

### 4.2 `claude-rules.ts`

**What it does:** Scans the project's `.claude/rules/` folder recursively for `.md` files and lists them in the system prompt. The agent can then `read` specific rules when working on related tasks.

**Activation:** `pi -e ./claude-rules.ts`

**Key APIs:**
- `pi.on("session_start")` — scan for rules files
- `pi.on("before_agent_start")` — append rules list to system prompt
- `fs.readdirSync()` with recursive traversal

**Pattern taught:** Progressive disclosure of project rules. Rather than loading all rules into context, list them so the agent loads only what's relevant. Also shows cross-harness compatibility (using Claude Code's `.claude/rules/` convention).

**Complexity:** ⭐⭐ Beginner+

---

### 4.3 `system-prompt-header.ts`

**What it does:** Shows the system prompt length in the status bar when the agent starts.

**Activation:** `pi -e ./system-prompt-header.ts`

**Key APIs:**
- `ctx.getSystemPrompt()` — access the effective system prompt
- `ctx.ui.setStatus()` — footer status indicator

**Pattern taught:** Minimal example of `getSystemPrompt()` for debugging/monitoring the system prompt.

**Complexity:** ⭐ Beginner

---

### 4.4 `custom-compaction.ts`

**What it does:** Replaces default compaction with a full conversation summary. Instead of keeping recent messages, summarizes ALL messages using Gemini Flash (cheaper/faster than the main model). Includes previous summary context for chained compactions.

**Activation:** `pi -e ./custom-compaction.ts`

**Key APIs:**
- `pi.on("session_before_compact")` — intercept compaction
- `event.preparation` — access `messagesToSummarize`, `turnPrefixMessages`, `previousSummary`
- `convertToLlm()` / `serializeConversation()` — serialize messages
- `complete()` with different model — use Gemini Flash for summarization
- `return { compaction: { summary, firstKeptEntryId, tokensBefore } }` — provide custom compaction
- `signal` — honor abort requests

**Pattern taught:** Complete custom compaction. Shows how to access the compaction preparation data, use a different model for summarization, and return a custom compaction result. Also demonstrates using `previousSummary` for iterative summarization.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 4.5 `trigger-compact.ts`

**What it does:** Auto-triggers compaction when context exceeds 100k tokens (checked at `turn_end`). Also provides `/trigger-compact [instructions]` for manual triggering with optional custom instructions.

**Activation:** `pi -e ./trigger-compact.ts`

**Key APIs:**
- `ctx.getContextUsage()` — check token count
- `ctx.compact({ customInstructions, onComplete, onError })` — trigger compaction
- `pi.on("turn_end")` — check after each turn

**Pattern taught:** Proactive compaction management. Shows the non-blocking `ctx.compact()` API with callbacks, and how to monitor context usage to prevent overflow.

**Complexity:** ⭐⭐ Beginner+

---

## 5. Git Integration

### 5.1 `git-checkpoint.ts`

**What it does:** Creates git stash checkpoints before each turn so that `/fork` can restore code to that point. On fork, offers to `git stash apply` the checkpoint.

**Activation:** `pi -e ./git-checkpoint.ts`

**Key APIs:**
- `pi.on("turn_start")` — create stash before LLM changes
- `pi.on("session_before_fork")` — offer code restoration
- `pi.exec("git", [...])` — git operations
- `Map<string, string>` — entryId → stash ref mapping

**Pattern taught:** Git-based code checkpointing tied to session entries. Shows how to correlate git state with conversation state for time-travel debugging.

**Complexity:** ⭐⭐ Beginner+

---

### 5.2 `auto-commit-on-exit.ts`

**What it does:** On shutdown, auto-commits all changes using the last assistant message's first line as the commit message (prefixed with `[pi]`).

**Activation:** `pi -e ./auto-commit-on-exit.ts`

**Key APIs:**
- `pi.on("session_shutdown")` — cleanup on exit
- `pi.exec("git", [...])` — git status/add/commit
- `ctx.sessionManager.getEntries()` — find last assistant message

**Pattern taught:** Shutdown hooks for cleanup. Shows how to access conversation history to generate meaningful commit messages automatically.

**Complexity:** ⭐⭐ Beginner+

---

## 6. UI: Status, Widgets & Footers

### 6.1 `status-line.ts`

**What it does:** Shows turn progress in the footer: "Ready" → "● Turn N..." (with spinner) → "✓ Turn N complete". Resets on new session.

**Activation:** `pi -e ./status-line.ts`

**Key APIs:**
- `ctx.ui.setStatus("id", text)` — persistent footer status
- `ctx.ui.theme.fg("accent"/"success"/"dim", text)` — themed coloring
- `pi.on("turn_start/turn_end/session_start/session_switch")` — lifecycle tracking

**Pattern taught:** The status line pattern. Use `setStatus` with a unique ID to manage a persistent indicator in the footer. Multiple extensions can each have their own status.

**Complexity:** ⭐ Beginner

---

### 6.2 `widget-placement.ts`

**What it does:** Shows widgets both above and below the editor to demonstrate placement options.

**Activation:** `pi -e ./widget-placement.ts`

**Key APIs:**
- `ctx.ui.setWidget("id", lines)` — widget above editor (default)
- `ctx.ui.setWidget("id", lines, { placement: "belowEditor" })` — below editor

**Pattern taught:** Widget positioning. Minimal example of the two widget placement zones.

**Complexity:** ⭐ Beginner

---

### 6.3 `model-status.ts`

**What it does:** Shows the current model in the status bar and logs model changes. Reacts to model switches via `/model`, Ctrl+P cycling, and session restore.

**Activation:** `pi -e ./model-status.ts`

**Key APIs:**
- `pi.on("model_select")` — fires on any model change
- `event.model` / `event.previousModel` / `event.source` — change details
- `ctx.ui.setStatus()` / `ctx.ui.notify()` — display updates

**Pattern taught:** Reacting to model changes. The `model_select` event distinguishes between "set" (explicit), "cycle" (Ctrl+P), and "restore" (session load).

**Complexity:** ⭐ Beginner

---

### 6.4 `notify.ts`

**What it does:** Sends native desktop/terminal notifications when the agent finishes and is waiting for input. Supports OSC 777 (Ghostty, iTerm2, WezTerm), OSC 99 (Kitty), and Windows Toast (Windows Terminal/WSL).

**Activation:** `pi -e ./notify.ts`

**Key APIs:**
- `pi.on("agent_end")` — trigger when agent finishes
- `process.stdout.write()` — raw terminal escape sequences
- Terminal detection via `process.env`

**Pattern taught:** System-level notifications from extensions. Shows how to detect the terminal emulator and use the appropriate notification protocol.

**Complexity:** ⭐⭐ Beginner+

---

### 6.5 `titlebar-spinner.ts`

**What it does:** Shows a braille spinner animation (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) in the terminal title while the agent is working. Stops and shows the base title when idle.

**Activation:** `pi -e ./titlebar-spinner.ts`

**Key APIs:**
- `ctx.ui.setTitle()` — set terminal title
- `setInterval()` — 80ms animation loop
- `pi.on("agent_start/agent_end/session_shutdown")` — start/stop animation
- `pi.getSessionName()` — include session name in title

**Pattern taught:** Terminal title manipulation and animation. Shows clean start/stop lifecycle management with proper cleanup on shutdown.

**Complexity:** ⭐ Beginner

---

### 6.6 `custom-footer.ts`

**What it does:** `/footer` toggles a custom footer showing token stats (↑input ↓output $cost), the current model, and git branch — all in one line.

**Activation:** `pi -e ./custom-footer.ts`

**Key APIs:**
- `ctx.ui.setFooter(factory)` — replace entire footer
- `footerData.getGitBranch()` — git branch (only available via footer)
- `footerData.onBranchChange(callback)` — re-render on branch change
- `ctx.sessionManager.getBranch()` — compute token totals
- `dispose` function — cleanup on footer replacement

**Pattern taught:** Complete footer replacement. Shows the footer factory pattern with access to `footerData` (git branch, extension statuses), the `dispose` cleanup function, and how to compute aggregate statistics from session entries.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 6.7 `custom-header.ts`

**What it does:** Replaces the built-in header (logo + keybinding hints) with a custom pi mascot rendered in block characters. Includes a `/builtin-header` command to restore the original.

**Activation:** `pi -e ./custom-header.ts`

**Key APIs:**
- `ctx.ui.setHeader(factory)` — replace header component
- `ctx.ui.setHeader(undefined)` — restore built-in
- `VERSION` import — access pi version
- Block character art with theme colors

**Pattern taught:** Header customization. Shows the factory pattern for header components and how to use theme colors for ASCII art.

**Complexity:** ⭐⭐ Beginner+

---

### 6.8 `message-renderer.ts`

**What it does:** Registers a custom renderer for "status-update" messages and provides `/status [warn|error] message` to send them. Messages display with colored level prefixes and expandable timestamps.

**Activation:** `pi -e ./message-renderer.ts`

**Key APIs:**
- `pi.registerMessageRenderer("customType", renderer)` — custom message display
- `pi.sendMessage({ customType, content, display, details })` — send custom messages
- `Box` component with `customMessageBg` — styled container
- `expanded` flag — show details on toggle

**Pattern taught:** Custom message types with tailored rendering. Shows the full pipeline: send a custom message → render it with a registered renderer → support expanded details.

**Complexity:** ⭐⭐ Beginner+

---

## 7. UI: Custom Editors

### 7.1 `modal-editor.ts`

**What it does:** Vim-style modal editor with Normal and Insert modes. Normal mode supports h/j/k/l navigation, 0/$ for line start/end, x for delete, i/a for entering insert mode. Shows mode indicator on bottom border.

**Activation:** `pi -e ./modal-editor.ts`

**Key APIs:**
- `CustomEditor` base class — extends built-in editor
- `handleInput(data)` — intercept keystrokes
- `super.handleInput(data)` — pass through to default handling
- `matchesKey(data, Key.escape)` — key matching
- `render()` override — add mode indicator
- `ctx.ui.setEditorComponent(factory)` — replace editor

**Pattern taught:** Custom editor implementation. `CustomEditor` gives you app keybindings (Escape to abort, Ctrl+D, etc.) for free. Override `handleInput` for your mode logic, call `super.handleInput` for keys you don't handle.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 7.2 `rainbow-editor.ts`

**What it does:** Highlights the word "ultrathink" with an animated rainbow shine effect (coral → yellow → green → teal → blue → purple → pink cycling with a 3-character bright shine moving across).

**Activation:** `pi -e ./rainbow-editor.ts`

**Key APIs:**
- `CustomEditor` base class
- `render()` override — post-process rendered lines with regex replace
- `setInterval()` / `tui.requestRender()` — 60ms animation loop
- 24-bit color: `\x1b[38;2;r;g;bm` — true color ANSI codes
- `getText()` — access editor content to check for trigger word

**Pattern taught:** Editor render post-processing and animation. Shows how to apply visual effects to specific text patterns without affecting editing behavior.

**Complexity:** ⭐⭐⭐ Intermediate

---

## 8. UI: Custom Components & Overlays

### 8.1 `overlay-test.ts`

**What it does:** Tests overlay compositing with inline text inputs and edge cases. Shows components rendered as floating modals on top of existing content.

**Activation:** `pi -e ./overlay-test.ts`

**Key APIs:**
- `ctx.ui.custom(factory, { overlay: true })` — overlay mode
- `overlayOptions: { anchor, width, margin }` — positioning

**Pattern taught:** Basic overlay usage and positioning.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 8.2 `overlay-qa-tests.ts`

**What it does:** Comprehensive overlay QA: all anchors (top-left/right, bottom-left/right, center), margins, percentage widths, stacking multiple overlays, overflow handling, animation, and responsive visibility.

**Activation:** `pi -e ./overlay-qa-tests.ts`

**Key APIs:**
- All `OverlayOptions` — anchor, width, maxHeight, margin
- `onHandle(handle)` — programmatic show/hide with `handle.setHidden()`
- Stacking multiple overlays

**Pattern taught:** The full overlay positioning system. Reference for every overlay configuration option.

**Complexity:** ⭐⭐⭐⭐ Advanced

---

## 9. Session Metadata & State

### 9.1 `session-name.ts`

**What it does:** `/session-name [name]` sets or shows a friendly session name that appears in the session selector instead of the first message.

**Activation:** `pi -e ./session-name.ts`

**Key APIs:**
- `pi.setSessionName(name)` — set display name
- `pi.getSessionName()` — get current name

**Pattern taught:** Session naming for better organization. Minimal example.

**Complexity:** ⭐ Beginner

---

### 9.2 `bookmark.ts`

**What it does:** `/bookmark [label]` labels the last assistant message for easy navigation in `/tree`. `/unbookmark` removes the last label.

**Activation:** `pi -e ./bookmark.ts`

**Key APIs:**
- `pi.setLabel(entryId, label)` — set/clear label on entry
- `ctx.sessionManager.getLabel(entryId)` — read label
- `ctx.sessionManager.getEntries()` — scan for entries

**Pattern taught:** Entry labeling for `/tree` navigation. Labels persist in the session and show up as bookmarks in the tree selector.

**Complexity:** ⭐ Beginner

---

## 10. Remote Execution & Sandboxing

### 10.1 `ssh.ts`

**What it does:** Delegates all tool operations (read, write, edit, bash) to a remote machine via SSH. Activated with `--ssh user@host` or `--ssh user@host:/path`. Overrides system prompt to show remote cwd, handles user `!` commands via SSH, and shows SSH status in footer.

**Activation:** `pi -e ./ssh.ts --ssh user@host`

**Key APIs:**
- `pi.registerFlag("ssh")` — CLI flag
- `createReadTool/WriteTool/EditTool/BashTool` with custom `Operations` — pluggable backends
- `ReadOperations` / `WriteOperations` / `EditOperations` / `BashOperations` — operation interfaces
- `pi.on("user_bash")` — intercept user `!` commands
- `pi.on("before_agent_start")` — modify system prompt with remote info
- Lazy resolution in `session_start` (flags not available during factory)

**Pattern taught:** **The complete remote execution pattern.** Shows how to override every tool's operations layer for SSH, handle user bash commands, and modify the system prompt. The lazy resolution pattern (resolve SSH config in `session_start`, not during extension load) is important because CLI flags aren't available during the factory function.

**Complexity:** ⭐⭐⭐⭐ Advanced

---

### 10.2 `bash-spawn-hook.ts`

**What it does:** Demonstrates the `spawnHook` option for the bash tool — sources `~/.profile` before every command and adds a custom environment variable.

**Activation:** `pi -e ./bash-spawn-hook.ts`

**Key APIs:**
- `createBashTool(cwd, { spawnHook })` — modify command/cwd/env before execution
- `spawnHook({ command, cwd, env }) => ({ command, cwd, env })` — transform function

**Pattern taught:** Pre-processing bash commands. Use `spawnHook` to source profiles, set environment variables, change cwd, or wrap commands.

**Complexity:** ⭐ Beginner

---

### 10.3 `interactive-shell.ts`

**What it does:** Enables running interactive commands (vim, htop, git rebase -i, ssh, psql, etc.) with full terminal access. Auto-detects interactive commands from a list of 60+ known programs. Supports `!i` prefix to force interactive mode. TUI suspends while the command runs.

**Activation:** `pi -e ./interactive-shell.ts`

**Key APIs:**
- `pi.on("user_bash")` — intercept user `!` commands
- `ctx.ui.custom()` + `tui.stop()` / `tui.start()` — suspend TUI for terminal access
- `spawnSync()` with `stdio: "inherit"` — full terminal pass-through
- `return { result: {...} }` — provide custom result to bypass default handling
- Environment variables for configuration (`INTERACTIVE_COMMANDS`, `INTERACTIVE_EXCLUDE`)

**Pattern taught:** Running interactive terminal programs from within pi. The key technique is `tui.stop()` to release the terminal, run the command, then `tui.start()` to resume.

**Complexity:** ⭐⭐⭐ Intermediate

---

## 11. Custom Providers

### 11.1 `custom-provider-anthropic/`

**What it does:** Custom Anthropic provider with OAuth support and custom streaming implementation. Shows how to register a provider that replaces or extends the built-in Anthropic provider.

**Key APIs:**
- `pi.registerProvider()` with full config (baseUrl, api, models, oauth, streamSimple)

**Complexity:** ⭐⭐⭐⭐ Advanced

---

### 11.2 `custom-provider-gitlab-duo/`

**What it does:** GitLab Duo provider using pi-ai's built-in Anthropic/OpenAI streaming via a GitLab proxy. Shows OAuth device flow integration.

**Key APIs:**
- `pi.registerProvider()` with OAuth config
- Built-in streaming APIs (no custom stream implementation needed)

**Complexity:** ⭐⭐⭐⭐ Advanced

---

### 11.3 `custom-provider-qwen-cli/`

**What it does:** Qwen CLI provider with OAuth device flow and OpenAI-compatible models.

**Key APIs:**
- `pi.registerProvider()` with OAuth device flow
- OpenAI-compatible model definitions

**Complexity:** ⭐⭐⭐⭐ Advanced

---

## 12. Inter-Extension Communication

### 12.1 `event-bus.ts`

**What it does:** Demonstrates `pi.events` for communication between extensions. Listens for `my:notification` events and provides `/emit` to send them. Any extension can emit events that other extensions listen to.

**Activation:** `pi -e ./event-bus.ts`

**Key APIs:**
- `pi.events.on("eventName", handler)` — listen for events
- `pi.events.emit("eventName", data)` — emit events
- Storing `ctx` reference for use in event callbacks

**Pattern taught:** Inter-extension communication. Use namespaced event names (e.g., `my:notification`) to avoid collisions. Store the `ctx` reference from a session event for use in event bus callbacks.

**Complexity:** ⭐⭐ Beginner+

---

### 12.2 `file-trigger.ts`

**What it does:** Watches `/tmp/agent-trigger.txt` for changes. When content is written, injects it as a custom message and triggers an LLM response. Useful for external systems to send commands to the agent.

**Activation:** `pi -e ./file-trigger.ts`

**Key APIs:**
- `fs.watch()` — file system watcher
- `pi.sendMessage({ customType, content, display }, { triggerTurn: true })` — inject message and trigger response
- External integration pattern

**Pattern taught:** External trigger integration. Shows how systems outside pi (scripts, CI, webhooks) can communicate with a running pi session by writing to a trigger file.

**Complexity:** ⭐⭐ Beginner+

---

## 13. Games

### 13.1 `snake.ts`

**What it does:** Full Snake game via `/snake`. Features game grid with Unicode box drawing, score/high-score tracking, pause/resume, and session persistence (game state survives exit and resume).

**Activation:** `pi -e ./snake.ts`

**Key APIs:**
- `ctx.ui.custom()` — full-screen custom component
- `setInterval()` / `tui.requestRender()` — game loop at 100ms
- `matchesKey()` + WASD — input handling
- `pi.appendEntry(type, data)` — persist game state
- `ctx.sessionManager.getEntries()` — restore saved game
- ANSI colors (`\x1b[32m`, etc.) — direct color codes
- `visibleWidth()` — safe padding calculation

**Pattern taught:** Real-time interactive components with game loop, keyboard input, rendering, and session persistence. The most complete `ctx.ui.custom()` example.

**Complexity:** ⭐⭐⭐ Intermediate

---

### 13.2 `space-invaders.ts`

**What it does:** Space Invaders game via `/invaders`. Similar pattern to Snake but more complex game logic.

**Activation:** `pi -e ./space-invaders.ts`

**Complexity:** ⭐⭐⭐ Intermediate

---

### 13.3 `doom-overlay/` (directory)

**What it does:** DOOM running as a WebAssembly overlay at 35 FPS! Uses half-block characters (▀) with 24-bit color for rendering. Auto-downloads the shareware WAD file. Full game controls (WASD, fire, use, weapons 1-7).

**Activation:** `pi -e ./doom-overlay` then `/doom-overlay`

**Key APIs:**
- `ctx.ui.custom(factory, { overlay: true, overlayOptions: { anchor: "center", width: "90%", maxHeight: "80%" } })` — overlay mode
- WebAssembly integration
- 35 FPS render loop with half-block character rendering
- WAD file auto-download

**Pattern taught:** The ultimate overlay demo. Proves the overlay system can handle real-time game rendering. Shows WebAssembly integration, high-frequency rendering, and complex overlay sizing.

**Complexity:** ⭐⭐⭐⭐⭐ Expert

---

## 14. Complex / Multi-Feature Extensions

### 14.1 `plan-mode/` (directory)

**What it does:** Full plan mode with read-only exploration, plan extraction, step tracking with `[DONE:n]` markers, progress widget, bash command allowlisting, and execution mode with full tool restoration.

**Activation:** `pi -e ./plan-mode` or `/plan` or `Ctrl+Alt+P` or `--plan`

**Key APIs:** `registerCommand`, `registerShortcut`, `registerFlag`, `setActiveTools`, `setStatus`, `setWidget`, `on("tool_call")` (bash filtering), `on("before_agent_start")` (context injection), `on("context")` (message filtering), `on("turn_end/agent_end")` (progress tracking), `appendEntry` (persistence), `sendMessage` (inject messages), `ctx.ui.select` (workflow prompts)

**Pattern taught:** The most complete extension example. Demonstrates every major API working together in a real workflow.

**Complexity:** ⭐⭐⭐⭐⭐ Expert

---

### 14.2 `preset.ts`

**What it does:** Named presets for model, thinking level, tools, and system prompt instructions. Loaded from JSON config files (`~/.pi/agent/presets.json` and `.pi/presets.json`). Activated via `--preset`, `/preset`, or `Ctrl+Shift+U` to cycle. Features a SelectList-based UI, session persistence, and automatic status display.

**Activation:** `pi -e ./preset.ts --preset plan`

**Key APIs:** `registerCommand`, `registerShortcut`, `registerFlag`, `setModel`, `setThinkingLevel`, `setActiveTools`, `on("before_agent_start")` (inject instructions), `appendEntry` (persist active preset), `ctx.modelRegistry.find()`, `SelectList` component, `DynamicBorder`, config file loading and merging

**Pattern taught:** Multi-source configuration (CLI flag → config files → command), cycling through options with shortcuts, and the SelectList component for rich selection UIs.

**Complexity:** ⭐⭐⭐⭐ Advanced

---

### 14.3 `tools.ts`

**What it does:** `/tools` command to interactively enable/disable tools with a SettingsList UI. Tool selection persists across restarts and respects branch navigation (restored from branch-specific entries).

**Activation:** `pi -e ./tools.ts`

**Key APIs:** `pi.getAllTools()` / `pi.getActiveTools()` / `pi.setActiveTools()`, `SettingsList` component, `getSettingsListTheme()`, `appendEntry` (persist per branch), `on("session_start/tree/fork")` (restore from branch)

**Pattern taught:** The SettingsList component for toggle-style settings, and branch-aware state persistence (different branches can have different tool configurations).

**Complexity:** ⭐⭐⭐ Intermediate

---

### 14.4 `subagent/` (directory)

**What it does:** Delegates tasks to specialized subagents running in separate `pi` processes. Supports single agent, parallel (up to 8 tasks, 4 concurrent), and chained workflows with `{previous}` placeholder. Agent definitions are markdown files with frontmatter (name, description, tools, model). Includes sample agents (scout, planner, reviewer, worker) and workflow prompt templates.

**Activation:** Symlink to `~/.pi/agent/extensions/subagent/`

**Key APIs:** `pi.registerTool()` (complex multi-mode tool), `pi.exec()` (spawn pi subprocesses), streaming output parsing, parallel execution with concurrency limits, markdown rendering in results, usage tracking

**Pattern taught:** Sub-agent orchestration. The most architecturally complex example — shows how to compose multiple AI agents with different models and tool sets into workflows.

**Complexity:** ⭐⭐⭐⭐⭐ Expert

---

### 14.5 `mac-system-theme.ts`

**What it does:** Polls macOS appearance (dark/light mode) every 2 seconds and syncs pi's theme automatically.

**Activation:** `pi -e ./mac-system-theme.ts`

**Key APIs:**
- `ctx.ui.setTheme("dark"/"light")` — switch theme
- `execAsync("osascript ...")` — query macOS appearance
- `setInterval()` — polling loop with cleanup on shutdown

**Pattern taught:** System integration and automatic theme switching.

**Complexity:** ⭐⭐ Beginner+

---

### 14.6 `rpc-demo.ts`

**What it does:** Exercises all RPC-supported extension UI methods. Designed to pair with an external RPC client script for testing the full extension UI protocol.

**Key APIs:** All `ctx.ui.*` methods in RPC context

**Complexity:** ⭐⭐⭐ Intermediate (testing/debugging tool)

---

### 14.7 `dynamic-resources/` (directory)

**What it does:** Loads skills, prompts, and themes dynamically using the `resources_discover` event.

**Key APIs:** `pi.on("resources_discover")` — dynamic resource registration

**Complexity:** ⭐⭐⭐ Intermediate

---

### 14.8 `with-deps/` (directory)

**What it does:** Demonstrates an extension with its own `package.json` and npm dependencies. Registers a `parse_duration` tool that uses the `ms` npm package to convert human-readable durations to milliseconds.

**Activation:** `cd with-deps && npm install`, then `pi -e ./with-deps`

**Key APIs:**
- `package.json` with dependencies
- `import ms from "ms"` — using npm packages
- jiti module resolution from extension's own `node_modules/`

**Pattern taught:** Using external npm dependencies in extensions. Just add a `package.json`, run `npm install`, and imports work automatically.

**Complexity:** ⭐⭐ Beginner+
