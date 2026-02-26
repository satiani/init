---
name: extension-tour
description: Interactive tour of all pi extension examples. Walks through 60+ example extensions by category with source code, explanations, and key patterns. Use when the user wants to explore, learn about, or browse available pi extensions.
---

# Extension Tour Skill

Provide an interactive guided tour of pi's example extensions.

## IMPORTANT: Use the Questionnaire Tool

The `questionnaire` tool is installed. You MUST use it for ALL user choices during the tour. Never ask the user to type numbers or responses in chat — always present interactive selection UIs.

### When to use single-question mode (1 question):
- Choosing a tour mode
- Picking a category to explore
- Picking an extension within a category
- "Install this?" yes/no decisions
- "What next?" after viewing an extension

### When to use multi-question mode (multiple questions):
- Batch install decisions (e.g., "Which of these Tier 1 extensions do you want?")
- Filtering preferences (e.g., pick complexity level AND category at once)

### Questionnaire call patterns:

**Single selection:**
```json
{
  "questions": [{
    "id": "category",
    "label": "Category",
    "prompt": "Which category would you like to explore?",
    "options": [
      { "value": "safety", "label": "Safety & Permission Gates", "description": "5 extensions — block dangerous commands, protect paths" },
      { "value": "tools", "label": "Custom Tools", "description": "9 extensions — register tools the LLM can call" }
    ]
  }]
}
```

**Batch install (multi-question):**
```json
{
  "questions": [
    {
      "id": "git-checkpoint",
      "label": "git-checkpoint",
      "prompt": "Install git-checkpoint.ts? Git stash per turn, restore on fork",
      "options": [
        { "value": "yes", "label": "Yes, install" },
        { "value": "no", "label": "No, skip" }
      ],
      "allowOther": false
    },
    {
      "id": "notify",
      "label": "notify",
      "prompt": "Install notify.ts? Desktop notification when agent finishes",
      "options": [
        { "value": "yes", "label": "Yes, install" },
        { "value": "no", "label": "No, skip" }
      ],
      "allowOther": false
    }
  ]
}
```

## How to Run the Tour

1. Read the full tour guide: `TOUR.md` (in this skill directory)
2. Read the quick-reference table: `REFERENCE.md` (in this skill directory)
3. Use the `questionnaire` tool to ask the user which **tour mode** they want:
   - Tour by category (default)
   - Tour by complexity (⭐ → ⭐⭐⭐⭐⭐)
   - Quick overview (highlights from each category)
   - Pattern tour (group by API pattern)
   - Install tour (practical extensions to install)
4. For each category/extension the user picks (via questionnaire):
   - List the extensions with descriptions
   - Use questionnaire to ask which to dive into
   - Read the actual source code from the examples directory
   - Walk through the code, explaining key patterns and APIs
   - Use questionnaire to ask: Install? → Next extension? → Another category? → Done?
5. For install decisions, use multi-question mode to batch yes/no for several extensions at once

## Source Code Location

All example extensions live at:
```
~/.volta/tools/image/packages/@mariozechner/pi-coding-agent/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/
```

## Installation Helper

To install an extension, copy it to the user's global extensions directory:
```bash
cp <source> ~/.pi/agent/extensions/
# For directory extensions:
cp -r <source-dir> ~/.pi/agent/extensions/
```

After installing, tell the user to run `/reload` in pi to pick up new extensions.

## Key Patterns to Highlight

When walking through extensions, emphasize these patterns:

1. **Tool call interception** (`on("tool_call")` + `{ block: true }`) — permission-gate, protected-paths
2. **State management via details** — todo.ts is the canonical example
3. **Custom tool rendering** (`renderCall`/`renderResult`) — built-in-tool-renderer.ts
4. **System prompt modification** (`on("before_agent_start")`) — pirate.ts, claude-rules.ts
5. **Input transformation** (`on("input")`) — input-transform.ts, inline-bash.ts
6. **Custom UI components** (`ctx.ui.custom()`) — question.ts, snake.ts
7. **Session persistence** (`pi.appendEntry()`) — todo.ts, snake.ts, plan-mode
8. **Message delivery modes** (`sendUserMessage` with steer/followUp) — send-user-message.ts
9. **Tool override** (register with same name) — tool-override.ts
10. **Remote execution** (pluggable Operations) — ssh.ts

## References

- [TOUR.md](TOUR.md) — Complete documentation on every extension
- [REFERENCE.md](REFERENCE.md) — Quick-reference table
- [list-extensions.sh](list-extensions.sh) — Script to list all available extensions
