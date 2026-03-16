#!/usr/bin/env bash
# Lists all pi example extensions with their one-line descriptions.
# Usage: ./list-extensions.sh [category]
# Categories: safety, tools, commands, prompt, git, ui-status, ui-editor,
#             ui-components, session, remote, providers, comms, games, complex

EXAMPLES_DIR="$HOME/.volta/tools/image/packages/@mariozechner/pi-coding-agent/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions"

if [ ! -d "$EXAMPLES_DIR" ]; then
    echo "Examples directory not found: $EXAMPLES_DIR"
    exit 1
fi

FILTER="${1:-all}"

print_header() {
    echo ""
    echo "═══ $1 ═══"
}

print_ext() {
    local name="$1"
    local desc="$2"
    local complexity="$3"
    printf "  %-30s %s [%s]\n" "$name" "$desc" "$complexity"
}

if [ "$FILTER" = "all" ] || [ "$FILTER" = "safety" ]; then
    print_header "Safety & Permission Gates"
    print_ext "permission-gate.ts" "Confirms dangerous bash commands (rm -rf, sudo)" "⭐"
    print_ext "protected-paths.ts" "Blocks writes to .env, .git/, node_modules/" "⭐"
    print_ext "confirm-destructive.ts" "Confirms session clear/switch/fork" "⭐"
    print_ext "dirty-repo-guard.ts" "Warns on uncommitted git changes" "⭐⭐"
    print_ext "sandbox/" "OS-level bash sandboxing" "⭐⭐⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "tools" ]; then
    print_header "Custom Tools"
    print_ext "hello.ts" "Minimal tool registration" "⭐"
    print_ext "question.ts" "Interactive question with options UI" "⭐⭐⭐"
    print_ext "questionnaire.ts" "Multi-question tabbed wizard" "⭐⭐⭐⭐"
    print_ext "todo.ts" "Stateful todo list with persistence" "⭐⭐⭐"
    print_ext "tool-override.ts" "Override built-in read with logging" "⭐⭐"
    print_ext "built-in-tool-renderer.ts" "Custom rendering for all built-in tools" "⭐⭐⭐"
    print_ext "minimal-mode.ts" "Minimal display for all tools" "⭐⭐⭐"
    print_ext "truncated-tool.ts" "Ripgrep wrapper with truncation" "⭐⭐"
    print_ext "antigravity-image-gen.ts" "Image generation via Google Antigravity" "⭐⭐⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "commands" ]; then
    print_header "Commands & Input Processing"
    print_ext "commands.ts" "List all slash commands with tab-complete" "⭐⭐"
    print_ext "send-user-message.ts" "Send user messages (steer/followUp)" "⭐⭐"
    print_ext "input-transform.ts" "Transform user input (?quick, ping)" "⭐⭐"
    print_ext "inline-bash.ts" "Expand !{command} in prompts" "⭐⭐"
    print_ext "handoff.ts" "Transfer context to new session" "⭐⭐⭐⭐"
    print_ext "qna.ts" "Extract questions into editor" "⭐⭐⭐"
    print_ext "summarize.ts" "Summarize conversation with Markdown UI" "⭐⭐⭐"
    print_ext "timed-confirm.ts" "Auto-dismissing dialogs with countdown" "⭐"
    print_ext "reload-runtime.ts" "Reload extensions via tool→command bridge" "⭐⭐"
    print_ext "shutdown-command.ts" "Graceful /quit command" "⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "prompt" ]; then
    print_header "System Prompt & Compaction"
    print_ext "pirate.ts" "Dynamic system prompt (pirate mode)" "⭐"
    print_ext "claude-rules.ts" "Load .claude/rules/ into system prompt" "⭐⭐"
    print_ext "system-prompt-header.ts" "Show system prompt length in status" "⭐"
    print_ext "custom-compaction.ts" "Custom compaction with Gemini Flash" "⭐⭐⭐"
    print_ext "trigger-compact.ts" "Auto-compact at 100k tokens" "⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "git" ]; then
    print_header "Git Integration"
    print_ext "git-checkpoint.ts" "Git stash checkpoints per turn" "⭐⭐"
    print_ext "auto-commit-on-exit.ts" "Auto-commit on shutdown" "⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "ui-status" ]; then
    print_header "UI: Status, Widgets & Footers"
    print_ext "status-line.ts" "Turn progress in footer" "⭐"
    print_ext "widget-placement.ts" "Widgets above/below editor" "⭐"
    print_ext "model-status.ts" "Model changes in status bar" "⭐"
    print_ext "notify.ts" "Desktop notifications (OSC 777/99)" "⭐⭐"
    print_ext "titlebar-spinner.ts" "Braille spinner in terminal title" "⭐"
    print_ext "custom-footer.ts" "Custom footer with git/tokens" "⭐⭐⭐"
    print_ext "custom-header.ts" "Custom header with pi mascot" "⭐⭐"
    print_ext "message-renderer.ts" "Custom message type rendering" "⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "ui-editor" ]; then
    print_header "UI: Custom Editors"
    print_ext "modal-editor.ts" "Vim-style modal editor" "⭐⭐⭐"
    print_ext "rainbow-editor.ts" "Rainbow shine animation" "⭐⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "ui-components" ]; then
    print_header "UI: Custom Components & Overlays"
    print_ext "overlay-test.ts" "Overlay compositing test" "⭐⭐⭐"
    print_ext "overlay-qa-tests.ts" "Comprehensive overlay QA" "⭐⭐⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "session" ]; then
    print_header "Session Metadata & State"
    print_ext "session-name.ts" "Name sessions for selector" "⭐"
    print_ext "bookmark.ts" "Bookmark entries for /tree" "⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "remote" ]; then
    print_header "Remote Execution & Sandboxing"
    print_ext "ssh.ts" "Full SSH remote execution" "⭐⭐⭐⭐"
    print_ext "bash-spawn-hook.ts" "Pre-process bash commands" "⭐"
    print_ext "interactive-shell.ts" "Interactive terminal commands" "⭐⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "providers" ]; then
    print_header "Custom Providers"
    print_ext "custom-provider-anthropic/" "Custom Anthropic with OAuth" "⭐⭐⭐⭐"
    print_ext "custom-provider-gitlab-duo/" "GitLab Duo via proxy" "⭐⭐⭐⭐"
    print_ext "custom-provider-qwen-cli/" "Qwen CLI with device flow" "⭐⭐⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "comms" ]; then
    print_header "Inter-Extension Communication"
    print_ext "event-bus.ts" "Shared event bus between extensions" "⭐⭐"
    print_ext "file-trigger.ts" "File watcher triggers messages" "⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "games" ]; then
    print_header "Games"
    print_ext "snake.ts" "Snake with persistence" "⭐⭐⭐"
    print_ext "space-invaders.ts" "Space Invaders" "⭐⭐⭐"
    print_ext "doom-overlay/" "DOOM in an overlay at 35 FPS" "⭐⭐⭐⭐⭐"
fi

if [ "$FILTER" = "all" ] || [ "$FILTER" = "complex" ]; then
    print_header "Complex / Multi-Feature"
    print_ext "plan-mode/" "Full plan mode with tracking" "⭐⭐⭐⭐⭐"
    print_ext "preset.ts" "Named presets (model/tools/thinking)" "⭐⭐⭐⭐"
    print_ext "tools.ts" "Interactive tool toggle UI" "⭐⭐⭐"
    print_ext "subagent/" "Sub-agent orchestration" "⭐⭐⭐⭐⭐"
    print_ext "dynamic-resources/" "Dynamic skill/prompt/theme loading" "⭐⭐⭐"
    print_ext "rpc-demo.ts" "RPC UI method testing" "⭐⭐⭐"
    print_ext "mac-system-theme.ts" "macOS dark/light sync" "⭐⭐"
    print_ext "with-deps/" "Extension with npm dependencies" "⭐⭐"
fi

echo ""
echo "Total: $(find "$EXAMPLES_DIR" -maxdepth 1 \( -name '*.ts' -o -type d ! -name extensions \) | wc -l | tr -d ' ') extensions"
echo "Source: $EXAMPLES_DIR"
