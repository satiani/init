---
name: code-tour
description: >
  IMPORTANT: You MUST invoke this skill BEFORE doing any exploration or research yourself when the
  user says "code tour", "give me a tour", "tour of", "walk me through", "show me how X works",
  "explain the codebase", "guided tour", "teach me about", or asks to understand a service's
  architecture or code structure. Do NOT use the Explore agent or read files yourself — invoke
  this skill first. Interactive educational tour using tmux side pane with nvim.
disable-model-invocation: false
allowed-tools: Bash, Read, Grep, Glob, Task, mcp__atlassian__search, mcp__atlassian__getConfluencePage
---

# Interactive Code Tour

Give an interactive educational tour explaining code by displaying it in a tmux side pane with nvim while walking through explanations.

## Arguments

`$ARGUMENTS` - The topic, service, or code area to tour (e.g., "apm-services-api", "authentication flow", "src/handlers")

## Setup Phase

1. **Verify tmux session**:
   ```bash
   echo "TMUX=$TMUX"
   ```
   If not in tmux, inform the user they need to run from a tmux session.

2. **Capture the current window ID** (CRITICAL for targeting commands correctly):
   ```bash
   tmux display-message -p '#{window_id}'
   ```
   Store this window ID (e.g., `@0`, `@1`, etc.) - you will use it for ALL subsequent tmux commands to ensure they target the correct window even if the user switches windows.

3. **Find code context** (for Datadog services):
   - Query Atlassian with `mcp__atlassian__search` for documentation about $ARGUMENTS
   - Fetch relevant Confluence pages for architecture context
   - Code locations: `~/dd/` (various repos) or `~/go/src/github.com/DataDog/dd-source` (monorepo)

4. **Create side pane with nvim**:
   ```bash
   tmux split-window -h -t {window_id} -c <working_directory> "nvim <initial_file>"
   ```

5. **Identify nvim pane and wait for startup**:
   ```bash
   tmux list-panes -t {window_id} -F '#{pane_index} #{pane_current_command}'
   ```
   Store the pane index (typically 2). The full target for commands will be `{window_id}.{pane_index}` (e.g., `@0.2`).

   After creating the pane, wait for nvim to be ready before sending any keys. Poll with `tmux list-panes` checking for `nvim` in the current command, or use a single `sleep 2` after split-window. This is the ONE place where a sleep is justified — nvim needs time to launch and render. After nvim is running, no further sleeps are needed for any tmux interactions.

## Navigation Pattern

**CRITICAL**: Use sub-agents (Task tool with subagent_type=Bash) for ALL nvim interactions to avoid polluting conversation context.

**CRITICAL**: Always use the full target `{window_id}.{pane_index}` (e.g., `@0.2`) for ALL tmux commands. This ensures commands go to the correct pane even if the user has switched to a different tmux window.

**CRITICAL - Line Numbers**: When explaining code to the user, always reference the **actual file line numbers** (shown in nvim's left gutter), NOT the position within the tmux capture output. The user sees nvim with line numbers - your references must match what they see. To get the current line number in nvim:
```bash
tmux send-keys -t {window_id}.{pane_index} ':echo line(".")' Enter
```
Or look at nvim's status line which shows the current line number (e.g., "321:1" means line 321, column 1).

**NO SLEEPS**: Do NOT use `sleep` commands between tmux send-keys and capture-pane. tmux commands are synchronous — send-keys completes before the next command runs, and nvim processes keystrokes immediately. Sleeps add unnecessary latency. Only add a sleep if a command demonstrably fails without one (e.g., waiting for nvim's initial startup after `split-window`).

Example sub-agent prompt:
```
Navigate nvim in tmux target {window_id}.{pane_index} to show {description} at line {line_number}.

Steps:
1. Send keys: tmux send-keys -t {window_id}.{pane_index} ':{line_number}' Enter 'zz'
2. Verify: tmux capture-pane -t {window_id}.{pane_index} -p | head -40
3. Note the actual file line numbers from nvim's status line or gutter

Do NOT use sleep between steps — tmux commands are synchronous.

Return brief confirmation of what's now visible, referencing ACTUAL file line numbers.
```

## Pacing Rules

**ABSOLUTE HARD RULE — NEVER VIOLATE**: This is an INTERACTIVE tour. You MUST:

1. After explaining what's on screen, ALWAYS end your message by asking for confirmation before navigating elsewhere:
   - "Ready to see [next concept]?"
   - "Let me know when you're ready to continue"
   - "Any questions before we move on?"

2. **ONE LOCATION PER MESSAGE**: Each message you send must navigate to AT MOST one new location. After explaining that location, you MUST STOP and wait for user confirmation. Do NOT navigate to a second location in the same message. Do NOT even describe what you plan to show next and then navigate there — just ask if the user is ready.

3. NEVER blast through multiple locations without user confirmation between each.

4. Give the user time to read and absorb the code in the side pane.

5. If you find yourself wanting to say "let me also show you X" or "now let me scroll to Y" in the same message — STOP. Ask first, navigate later.

## Reading User Selections

Users can highlight code in nvim and ask questions about it.

**User workflow**: Select text in visual mode → Press `Escape` → Ask question

**To read the selection** (run directly, not in sub-agent):
```bash
tmux send-keys -t {window_id}.{pane_index} ':lua local s,e=vim.fn.getpos("'"'"'<"),vim.fn.getpos("'"'"'>"); local l=vim.fn.getline(s[2]); vim.fn.writefile({l:sub(s[3],e[3])}, "/tmp/nvim_sel.txt")' Enter && cat /tmp/nvim_sel.txt
```

This reads from `'<` and `'>` marks (set when exiting visual mode) without modifying registers or clipboard.

**When user asks about a selection**:
1. Read the selection using the command above
2. Use a sub-agent (Task with subagent_type=Explore) to research what the selected code does
3. Provide a concise explanation

## Tour Structure

1. **Overview**: Start with high-level context from documentation
2. **Entry point**: Show main() or equivalent, explain the starting point
3. **Dependencies**: Walk through initialization and dependency injection
4. **Core logic**: Show key handlers, routes, or business logic
5. **Integration points**: Show connections to other services
6. **Q&A**: Let user highlight and ask about specific code

## Example Flow

```
[You] "Let me give you a tour of {service}. First, let me find the documentation..."
[Query Atlassian, setup tmux pane]

[You] "This service does X. Looking at the entry point now..."
[Sub-agent navigates to main()]

[You] "Here's main() - it creates the API server with these options: ...
       Ready to see how dependencies are wired up?"

[Wait for user: "yes"]

[Sub-agent navigates to next location]
[Explain, then ask for confirmation again]

[User highlights something, asks "what does this do?"]
[Read selection, research with sub-agent, explain]
```

## Cleanup

When tour is complete, optionally close the pane:
```bash
tmux send-keys -t {window_id}.{pane_index} ':q!' Enter
```
Or leave it open for the user to continue exploring.
