---
name: markdown-formatting
description: >
  Load this skill before writing markdown files that contain tables or ASCII diagrams.
  Uses prettier and graph-easy to produce deterministically aligned output instead of
  relying on token-by-token generation which consistently misaligns column borders and
  box-drawing characters.
triggers:
  - markdown
  - table
  - diagram
  - architecture diagram
  - box diagram
  - flow diagram
  - ascii diagram
  - design doc
  - write a doc
  - .md file
---

# Markdown Formatting Skill

LLM token-by-token generation cannot reliably align table columns or draw ASCII boxes.
Use these deterministic tools instead.

---

## Line width rule

**All prose lines must be ≤ 120 characters.**

When writing or editing markdown, hard-wrap paragraph text at 120 columns. This
applies to all non-structural content: paragraphs, list item text, blockquotes.

Exceptions that may exceed 120 characters:
- **Tables** — prettier controls column alignment; do not manually break table rows.
- **Fenced code blocks** — content inside `` ``` `` is literal; do not rewrap.
- **URLs / link definitions** — a long URL on one line is fine.

When a file contains tables or code blocks that exceed 120 characters, add a
vim modeline as the **very first line** of the file to disable soft wrapping in
nvim so wide lines render correctly:

```
<!-- vim: set nowrap: -->
```

Only add the modeline when at least one table or code block actually exceeds 120
characters. If everything fits within 120, omit it.

### Prettier prose-wrap setting

Run prettier with `--prose-wrap always` and a 120-column print width so it
hard-wraps paragraph text for you:

```bash
npx prettier --write --prose-wrap always --print-width 120 <file>.md
```

This handles paragraph rewrapping automatically. Tables and fenced code blocks
are left untouched by prettier.

---

## Tools

| Tool | Purpose | Install check |
|---|---|---|
| `npx prettier` | Align tables + hard-wrap prose at 120 cols | `npx prettier --version` |
| `graph-easy` | Render ASCII box-and-arrow diagrams | `graph-easy --version` |

---

## Critical ordering rule

**Prettier first, diagrams second.**

Prettier mangles whitespace inside fenced code blocks. Always run prettier on the
file *before* inserting any diagrams. Use placeholder markers for diagram locations.

---

## Workflow

### 1. Write the markdown file

Write tables with minimal formatting (no manual padding). Write prose without
worrying about line length — prettier will wrap it. Use placeholder text where
diagrams will go:

```markdown
## Services

| Name | Owner | Status |
| --- | --- | --- |
| gateway | platform | healthy |
| processor | backend | degraded |

## Architecture

ARCH_DIAGRAM

## Data Flow

FLOW_DIAGRAM
```

### 2. Run prettier (aligns tables, wraps prose at 120 cols)

```bash
npx prettier --write --prose-wrap always --print-width 120 <file>.md
```

### 3. Generate diagrams to temp files

```bash
echo '
graph { flow: east; }
[ Service A ] -> [ Service B ] -> [ Database ]
' | graph-easy --as boxart > /tmp/diagram.txt 2>/dev/null
```

### 4. Insert diagrams after prettier

```python
python3 << 'PYEOF'
with open('<file>.md', 'r') as f:
    content = f.read()
with open('/tmp/diagram.txt', 'r') as f:
    diagram = f.read()
content = content.replace('ARCH_DIAGRAM', '```\n' + diagram.rstrip() + '\n```')
with open('<file>.md', 'w') as f:
    f.write(content)
PYEOF
```

### 5. Add vim modeline if needed

After all diagrams are inserted, check whether any line exceeds 120 characters.
If so, prepend the modeline:

```bash
if awk 'length > 120 { found=1; exit } END { exit !found }' <file>.md; then
  sed -i '' '1s/^/<!-- vim: set nowrap: -->\n/' <file>.md
fi
```

### 6. Verify

Read the file and confirm:
- All `|` table borders align
- All box characters connect in diagrams
- No prose line exceeds 120 characters (tables and code blocks excluded)

---

## graph-easy reference

### Basic syntax

```
[ Node A ] -> [ Node B ]           # edge
[ Node A ] -> [ Node B ] -> [ C ]  # chain
```

### Flow direction

```
graph { flow: east; }    # left-to-right (default)
graph { flow: south; }   # top-to-bottom
```

### Multiline text in boxes

Use `\n` for line breaks inside a node:

```
[ ingestion-gateway\nGo, 12 replicas\np99: 50ms ]
```

Renders as:

```
┌───────────────────┐
│ ingestion-gateway │
│  Go, 12 replicas  │
│     p99: 50ms     │
└───────────────────┘
```

**Node names must match exactly across all edge references** — repeat the full
`\n`-containing string every time you reference the node.

### Record separator `|`

The `|` character inside a node creates internal cell dividers:

```
[ Name | Type | Status ]
```

**Avoid `|` when the node has edges.** Graph-easy routes edges to individual cells,
producing chaotic layouts. Use `\n` instead for nodes that participate in connections.

### Groups (boxes around boxes)

Use `( )` for groups that contain nodes:

```
( Processing
  [ trace-processor ]
  [ metric-aggregator ]
)
```

Renders as a dashed box containing the inner nodes.

**Single-level groups work well.** Nested groups (`( Outer ( Inner ... ) )`) parse
correctly but the ASCII renderer flattens the outer box — it won't visually wrap
the inner group. Stick to one level of grouping.

**Edges crossing group boundaries** may break the dashed border line at the crossing
point. This is cosmetic and unavoidable with graph-easy.

### Output formats

```
graph-easy --as boxart    # box-drawing characters (┌─┐│└─┘) — preferred
graph-easy --as ascii     # plain ASCII (+-+ | +-+)
```

---

## Complete example

```bash
# 1. Write file with tables + placeholders
cat > doc.md << 'EOF'
# Architecture

| Service | Language | Replicas |
| --- | --- | --- |
| gateway | Go | 12 |
| processor | Rust | 8 |

## Topology

TOPOLOGY_DIAGRAM
EOF

# 2. Prettier aligns tables + wraps prose at 120 cols
npx prettier --write --prose-wrap always --print-width 120 doc.md

# 3. Generate diagram
echo '
graph { flow: east; }
[ Clients ] -> [ gateway\nGo, 12 replicas ] -> [ processor\nRust, 8 replicas ] -> [ S3 ]
' | graph-easy --as boxart > /tmp/topo.txt 2>/dev/null

# 4. Insert diagram
python3 << 'PYEOF'
with open('doc.md', 'r') as f:
    content = f.read()
with open('/tmp/topo.txt', 'r') as f:
    diagram = f.read()
content = content.replace('TOPOLOGY_DIAGRAM', '```\n' + diagram.rstrip() + '\n```')
with open('doc.md', 'w') as f:
    f.write(content)
PYEOF

# 5. Add vim modeline if any line exceeds 120 chars (tables/code blocks)
if awk 'length > 120 { found=1; exit } END { exit !found }' doc.md; then
  sed -i '' '1s/^/<!-- vim: set nowrap: -->\n/' doc.md
fi
```
