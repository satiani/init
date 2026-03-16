# Pi Extension Examples — Quick Reference

## All Extensions at a Glance

| # | Extension | Category | Complexity | Key Pattern | Activation |
|---|-----------|----------|------------|-------------|------------|
| 1 | `permission-gate.ts` | Safety | ⭐ | tool_call interception, blocking | `-e` or copy |
| 2 | `protected-paths.ts` | Safety | ⭐ | Path-based write blocking | `-e` or copy |
| 3 | `confirm-destructive.ts` | Safety | ⭐ | session_before_* cancellation | `-e` |
| 4 | `dirty-repo-guard.ts` | Safety | ⭐⭐ | pi.exec + session events | `-e` |
| 5 | `sandbox/` | Safety | ⭐⭐⭐⭐ | OS-level sandboxing, BashOperations | `-e` |
| 6 | `hello.ts` | Tools | ⭐ | Minimal registerTool | `-e` |
| 7 | `question.ts` | Tools | ⭐⭐⭐ | Custom UI tool, Editor component | `-e` |
| 8 | `questionnaire.ts` | Tools | ⭐⭐⭐⭐ | Tabbed wizard, multi-mode UI | `-e` |
| 9 | `todo.ts` | Tools | ⭐⭐⭐ | **State via details** (canonical) | `-e` |
| 10 | `tool-override.ts` | Tools | ⭐⭐ | Override built-in, audit logging | `-e` |
| 11 | `built-in-tool-renderer.ts` | Tools | ⭐⭐⭐ | renderCall/renderResult for all tools | `-e` |
| 12 | `minimal-mode.ts` | Tools | ⭐⭐⭐ | Override all 7 tools for minimal display | `-e` |
| 13 | `truncated-tool.ts` | Tools | ⭐⭐ | **Output truncation** (canonical) | `-e` |
| 14 | `antigravity-image-gen.ts` | Tools | ⭐⭐⭐⭐ | Image gen, OAuth provider, config files | `-e` + `/login` |
| 15 | `commands.ts` | Commands | ⭐⭐ | getCommands(), tab-completion | `-e` |
| 16 | `send-user-message.ts` | Commands | ⭐⭐ | sendUserMessage (steer/followUp) | `-e` |
| 17 | `input-transform.ts` | Commands | ⭐⭐ | input event (transform/handled/continue) | `-e` |
| 18 | `inline-bash.ts` | Commands | ⭐⭐ | Input expansion with shell commands | `-e` |
| 19 | `handoff.ts` | Commands | ⭐⭐⭐⭐ | Session transfer, LLM summary, editor | `-e` |
| 20 | `qna.ts` | Commands | ⭐⭐⭐ | Prompt generator pattern | `-e` |
| 21 | `summarize.ts` | Commands | ⭐⭐⭐ | Different model, Markdown component | `-e` |
| 22 | `timed-confirm.ts` | Commands | ⭐ | timeout option, AbortSignal | `-e` |
| 23 | `reload-runtime.ts` | Commands | ⭐⭐ | Tool→command bridge for ctx.reload() | `-e` |
| 24 | `shutdown-command.ts` | Commands | ⭐ | ctx.shutdown() (deferred) | `-e` |
| 25 | `pirate.ts` | Prompt | ⭐ | before_agent_start, system prompt append | `-e` or copy |
| 26 | `claude-rules.ts` | Prompt | ⭐⭐ | Progressive rule disclosure | `-e` or copy |
| 27 | `system-prompt-header.ts` | Prompt | ⭐ | getSystemPrompt() | `-e` |
| 28 | `custom-compaction.ts` | Prompt | ⭐⭐⭐ | session_before_compact, custom summary | `-e` |
| 29 | `trigger-compact.ts` | Prompt | ⭐⭐ | ctx.compact(), getContextUsage() | `-e` |
| 30 | `git-checkpoint.ts` | Git | ⭐⭐ | Stash per turn, restore on fork | `-e` |
| 31 | `auto-commit-on-exit.ts` | Git | ⭐⭐ | session_shutdown, auto-commit | `-e` |
| 32 | `status-line.ts` | UI-Status | ⭐ | setStatus() lifecycle | `-e` |
| 33 | `widget-placement.ts` | UI-Status | ⭐ | setWidget() above/below editor | `-e` |
| 34 | `model-status.ts` | UI-Status | ⭐ | model_select event | `-e` |
| 35 | `notify.ts` | UI-Status | ⭐⭐ | Desktop notifications (OSC 777/99) | `-e` |
| 36 | `titlebar-spinner.ts` | UI-Status | ⭐ | setTitle() animation | `-e` |
| 37 | `custom-footer.ts` | UI-Status | ⭐⭐⭐ | setFooter(), footerData, git branch | `-e` |
| 38 | `custom-header.ts` | UI-Status | ⭐⭐ | setHeader(), ASCII art | `-e` |
| 39 | `message-renderer.ts` | UI-Status | ⭐⭐ | registerMessageRenderer, sendMessage | `-e` |
| 40 | `modal-editor.ts` | UI-Editor | ⭐⭐⭐ | CustomEditor, modal input handling | `-e` or copy |
| 41 | `rainbow-editor.ts` | UI-Editor | ⭐⭐⭐ | Editor render post-processing, animation | `-e` |
| 42 | `overlay-test.ts` | UI-Overlay | ⭐⭐⭐ | ctx.ui.custom with overlay: true | `-e` |
| 43 | `overlay-qa-tests.ts` | UI-Overlay | ⭐⭐⭐⭐ | Full OverlayOptions API | `-e` |
| 44 | `session-name.ts` | Session | ⭐ | setSessionName/getSessionName | `-e` |
| 45 | `bookmark.ts` | Session | ⭐ | setLabel for /tree navigation | `-e` |
| 46 | `ssh.ts` | Remote | ⭐⭐⭐⭐ | **Full remote execution** (canonical) | `-e --ssh` |
| 47 | `bash-spawn-hook.ts` | Remote | ⭐ | spawnHook for bash pre-processing | `-e` |
| 48 | `interactive-shell.ts` | Remote | ⭐⭐⭐ | tui.stop/start for terminal access | `-e` |
| 49 | `custom-provider-anthropic/` | Providers | ⭐⭐⭐⭐ | registerProvider with OAuth + streaming | `-e` |
| 50 | `custom-provider-gitlab-duo/` | Providers | ⭐⭐⭐⭐ | registerProvider via proxy | `-e` |
| 51 | `custom-provider-qwen-cli/` | Providers | ⭐⭐⭐⭐ | registerProvider with device flow | `-e` |
| 52 | `event-bus.ts` | Comms | ⭐⭐ | pi.events (on/emit) | `-e` |
| 53 | `file-trigger.ts` | Comms | ⭐⭐ | fs.watch + sendMessage(triggerTurn) | `-e` |
| 54 | `snake.ts` | Games | ⭐⭐⭐ | Game loop, input, persistence | `-e` |
| 55 | `space-invaders.ts` | Games | ⭐⭐⭐ | Game loop, sprites | `-e` |
| 56 | `doom-overlay/` | Games | ⭐⭐⭐⭐⭐ | WebAssembly, overlay, 35 FPS render | `-e` |
| 57 | `plan-mode/` | Complex | ⭐⭐⭐⭐⭐ | **Full workflow** (every API) | `-e` or copy |
| 58 | `preset.ts` | Complex | ⭐⭐⭐⭐ | Config files, SelectList, cycling | `-e` |
| 59 | `tools.ts` | Complex | ⭐⭐⭐ | SettingsList, branch-aware persistence | `-e` |
| 60 | `subagent/` | Complex | ⭐⭐⭐⭐⭐ | Sub-agent orchestration | symlink |
| 61 | `dynamic-resources/` | Complex | ⭐⭐⭐ | resources_discover event | `-e` |
| 62 | `rpc-demo.ts` | Complex | ⭐⭐⭐ | RPC UI protocol testing | `-e` |
| 63 | `mac-system-theme.ts` | Complex | ⭐⭐ | setTheme, macOS integration | `-e` |
| 64 | `with-deps/` | Complex | ⭐⭐ | npm dependencies in extensions | `-e` |

## By Complexity

### ⭐ Beginner (12 extensions)
Start here. Each demonstrates one concept clearly.

`permission-gate.ts`, `protected-paths.ts`, `confirm-destructive.ts`, `hello.ts`, `timed-confirm.ts`, `shutdown-command.ts`, `pirate.ts`, `system-prompt-header.ts`, `status-line.ts`, `widget-placement.ts`, `model-status.ts`, `titlebar-spinner.ts`, `session-name.ts`, `bookmark.ts`, `bash-spawn-hook.ts`

### ⭐⭐ Beginner+ (15 extensions)
Combines 2-3 concepts. Good second step.

`dirty-repo-guard.ts`, `tool-override.ts`, `truncated-tool.ts`, `commands.ts`, `send-user-message.ts`, `input-transform.ts`, `inline-bash.ts`, `reload-runtime.ts`, `claude-rules.ts`, `trigger-compact.ts`, `git-checkpoint.ts`, `auto-commit-on-exit.ts`, `notify.ts`, `custom-header.ts`, `message-renderer.ts`, `event-bus.ts`, `file-trigger.ts`, `mac-system-theme.ts`, `with-deps/`

### ⭐⭐⭐ Intermediate (12 extensions)
Substantial implementations with custom UI or complex logic.

`question.ts`, `todo.ts`, `built-in-tool-renderer.ts`, `minimal-mode.ts`, `qna.ts`, `summarize.ts`, `custom-compaction.ts`, `custom-footer.ts`, `modal-editor.ts`, `rainbow-editor.ts`, `overlay-test.ts`, `interactive-shell.ts`, `snake.ts`, `space-invaders.ts`, `tools.ts`, `dynamic-resources/`, `rpc-demo.ts`

### ⭐⭐⭐⭐ Advanced (8 extensions)
Multi-API, complex architectures, production-quality patterns.

`sandbox/`, `questionnaire.ts`, `antigravity-image-gen.ts`, `handoff.ts`, `ssh.ts`, `overlay-qa-tests.ts`, `preset.ts`, `custom-provider-*`

### ⭐⭐⭐⭐⭐ Expert (3 extensions)
Full-featured systems using every major API.

`plan-mode/`, `subagent/`, `doom-overlay/`

## By Key Pattern

| Pattern | Best Example | Also Demonstrated In |
|---------|-------------|---------------------|
| Tool call blocking | `permission-gate.ts` | `protected-paths.ts`, `plan-mode/` |
| State persistence via details | `todo.ts` | `plan-mode/`, `tools.ts` |
| Custom tool rendering | `built-in-tool-renderer.ts` | `todo.ts`, `question.ts`, `truncated-tool.ts` |
| System prompt modification | `pirate.ts` | `claude-rules.ts`, `plan-mode/`, `preset.ts` |
| Input transformation | `input-transform.ts` | `inline-bash.ts` |
| Custom UI component | `question.ts` | `questionnaire.ts`, `snake.ts`, `summarize.ts` |
| Session event handling | `confirm-destructive.ts` | `dirty-repo-guard.ts`, `todo.ts` |
| Message injection | `send-user-message.ts` | `file-trigger.ts`, `plan-mode/` |
| Output truncation | `truncated-tool.ts` | `built-in-tool-renderer.ts` |
| Tool override | `tool-override.ts` | `built-in-tool-renderer.ts`, `minimal-mode.ts` |
| Remote execution | `ssh.ts` | `bash-spawn-hook.ts`, `sandbox/` |
| Custom editor | `modal-editor.ts` | `rainbow-editor.ts` |
| Overlay components | `overlay-test.ts` | `overlay-qa-tests.ts`, `doom-overlay/` |
| CLI flags | `ssh.ts` | `plan-mode/`, `preset.ts`, `sandbox/` |
| Custom providers | `custom-provider-anthropic/` | `custom-provider-gitlab-duo/`, `custom-provider-qwen-cli/` |
| Config file loading | `preset.ts` | `sandbox/`, `antigravity-image-gen.ts` |
| Different model for task | `custom-compaction.ts` | `summarize.ts`, `handoff.ts` |

## Currently Installed

Extensions in `~/.pi/agent/extensions/`:
```
permission-gate.ts    (from examples)
protected-paths.ts    (from examples)
plan-mode/            (from examples)
modal-editor.ts       (from examples)
```
