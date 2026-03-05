---
name: tech-workshop
description: >
  Use this skill when the user wants an interactive, hands-on workshop to learn a technology
  through building a real application together. Triggered by phrases like "teach me X",
  "let's learn X together", "build an app with X", "explore X performance", "deep dive into X",
  or "workshop on X". Combines infrastructure setup, realistic scaffold, code tour, Socratic
  teaching, and live measurement. The user writes code in their editor; Claude handles
  infrastructure, measurements, and applies changes on request.
disable-model-invocation: false
allowed-tools: Bash(echo *), Bash(tmux *), Bash(nvim *), Bash(sleep *), Bash(docker *), Bash(go *), Bash(npm *), Bash(bun *), Bash(python3 *), Bash(brew *), Bash(curl *), Bash(cat *), Bash(ls *), Bash(mkdir *), Bash(chmod *), Bash(pkill *), Bash(sed *), Bash(grep *), Bash(wrangler *), Read, Write, Edit, Grep, Glob, Task, mcp__atlassian__search, mcp__atlassian__getConfluencePage
---

# Interactive Technology Workshop

Teach a technology by building a real application together. The user learns by doing — they
write the code, Claude sets up the environment and measures the results.

## Arguments

`$ARGUMENTS` - The technology and learning goal (e.g., "ClickHouse performance optimization",
"Kafka event streaming patterns", "Cloudflare Workers edge computing", "Redis caching strategies")

---

## Step 1 — Understand the Goal

Before doing anything, clarify with the user:
1. **What technology** they want to learn and what aspect of it (performance? patterns? fundamentals?)
2. **What language/runtime** they prefer for the application layer
3. **What dataset or domain** interests them (offer 2-3 realistic options that showcase the technology's strengths)

Don't assume — ask. These choices shape everything that follows.

---

## Step 2 — Set Up Infrastructure

### Check before installing
- Query Atlassian for internal best practices: `mcp__atlassian__search: "{technology} installation best practices"`
- Check what's already available: runtimes, container tooling, package managers
- Follow internal guidance if it exists (e.g., Colima over Docker Desktop)

### Install what's needed
This varies completely by technology:
- **Database technologies**: likely a Docker container or local binary
- **Cloud services**: likely a CLI tool and account setup
- **Libraries/frameworks**: likely a package install

Show the user what you're doing and why. Verify everything responds before proceeding.

---

## Step 3 — Build the Scaffold

Build a minimal but realistic application that will serve as the learning vehicle.

### Scaffold design principles
- **Real, not toy**: an HTTP API, a streaming pipeline, a worker — something that resembles production
- **Multiple access patterns**: design endpoints/handlers that exercise different aspects of the technology
- **Deliberately naive first**: start with the simplest, most obvious approach — this becomes the baseline
- **Comment the deliberate shortcomings**: `// NOTE: naive approach — optimization target`
- **Use real data where possible**: public datasets, realistic synthetic data, or actual API data

### Division of labor — maintain this throughout the entire workshop
- **Claude builds**: the initial scaffold, infrastructure, schema, data loading
- **Claude runs**: benchmarks, measurements, monitoring, build verification
- **Claude applies**: database migrations, infrastructure changes, deploys
- **User writes**: all optimization code, schema changes, configuration changes — in their own editor
- **User runs**: manual exploration queries (in shells Claude opens), filesystem exploration

### Data loading
- Load in the background wherever possible so other work continues
- Show progress periodically
- 50-100M rows (or equivalent scale) is enough to make differences visible — don't over-load

---

## Step 4 — Present the System Architecture

Before looking at any code, orient the user to the complete system picture — both what is
running and what isn't yet. Draw this from your own context since you built everything in
Steps 2 and 3.

The diagram must cover four categories:

**Installed**
- Everything installed onto the machine during setup: packages, binaries, libraries, CLI tools
- Where each was installed and how (brew, apt, npm, cargo, etc.)
- This gives the user a clean teardown list once the workshop is done

**Running now**
- Every active process: name, PID, port, binary path
- Communication paths between processes (TCP, IPC, in-process library/CGO calls)
- Data locations: where data lives on disk or in memory, and roughly how much
- Internal role decomposition: if one OS process runs multiple logical roles
  (e.g., FDB coordinator + storage + log in one `fdbserver`), call those out explicitly

**Ran and finished**
- One-shot tools that completed during setup (seeders, migration scripts, schema initializers)
- What each one did and where it left its output

**Built but not started yet**
- Any servers, workers, or tools that are implemented and ready to run but haven't been
  started — e.g., a benchmark tool, a secondary server, a consumer process
- Make clear that you'll prompt the user to start these at the right moment in the workshop

Use an ASCII diagram to show the relationships. Use real values — actual ports, actual file
paths, actual row counts — from your build context.

After presenting the diagram, pause and invite questions before moving on to the code tour.

---

## Step 5 — Tour the Scaffold

**Invoke the code-tour skill** to walk the user through what was built. This gives the user
a solid mental model of the code before they start making changes.

The tour should cover:
1. **Entry point** — how the application starts and is configured
2. **Connection/client setup** — how it connects to the technology being learned
3. **Each handler/worker** — what query or operation it performs, and why the current approach is naive
4. **Schema/configuration** — the data model or config, with commentary on what's suboptimal

After the tour, summarize the baseline measurements so the user knows where they stand.

**IMPORTANT**: Do not replicate the code-tour implementation here. Use the code-tour skill
directly — it handles tmux pane management, nvim setup, interactive pacing, and file navigation.
Any improvements to code-tour automatically benefit this skill.

---

## Step 6 — The Teaching Loop

This is the core of the workshop. For each concept to teach:

### Socratic method — ALWAYS follow this pattern
1. **Show the problem** with concrete numbers: "this endpoint scanned X to return Y" or
   "this request took Xms — here's where the time went"
2. **Ask the user** what they think the fix is — before explaining it
3. **If they don't know**: give a hint, not the answer. "Think about what the index contains"
   or "What if the data was pre-computed?"
4. **If they're partially right**: confirm what's correct and ask the refining question.
   "Yes, that's one change — what's the other?"
5. **When they have the answer**: have them write the change in their editor
6. **Review their work**: read the file, point out issues clearly ("line 8: trailing comma
   will cause a parse error"), wait for them to fix it
7. **Apply and measure**: Claude applies the change and runs the benchmark
8. **Show before/after**: always present a clear comparison table

### When the user writes something wrong
- Point out the specific issue: what line, what's wrong, what it should be
- Wait for them to fix it — don't fix it for them
- Only fix trivial syntax issues (a missing comma Claude introduced) on their behalf

### When the user asks a tangent question
Answer fully and directly in text. Don't navigate the editor or change context — tangent
questions are about understanding, not about looking at new code. These are some of the most
valuable teaching moments. Return to the main thread when the user is satisfied.

### When the user asks to see code or explore
Open the file in the nvim pane (if it's still active from the code-tour) or re-invoke
code-tour. If the user asks for a SQL/REPL/bash shell, open it as described below.

---

## Supporting Shells

Open shells when the user needs to explore or run manual commands. Always open as
**vertical splits below the nvim pane** — never as new tmux windows.

Use the **tmux skill** to open each shell, passing `{nvim_pane_id}` as the target pane so the
split lands below the nvim half of the window rather than the agent pane.

**SQL / REPL shell** (for manual queries, seed inserts): open a pane targeting `{nvim_pane_id}` running:
```
docker exec -it {container} {cli} --database {db}
```

**Bash exploration shell** (for filesystem, logs): open a pane targeting `{nvim_pane_id}` running:
```
docker exec -it {container} bash -c 'cd {path} && bash'
```

Tell the user what CWD they're in and what to start exploring.

---

## Measurement

### Build one measurement script and keep it
Create a single benchmark/measurement script early and reuse it for every comparison.
Never create a new script — fix the existing one when it breaks.

### Key principles
- Always measure before AND after each change using the same script
- Present results as a clear comparison table
- Anchor explanations in concrete numbers, not vague claims
- The metric that matters most depends on the technology:
  - Databases: rows scanned, bytes read, query time
  - Streaming: throughput, latency percentiles, consumer lag
  - Edge/serverless: cold start, response time, request cost
  - Caching: hit ratio, latency saved, memory used

### When measurement tooling has timing/lag issues
Diagnose the root cause (e.g., async log flushing) and fix the script. Common patterns:
- Poll for results instead of using fixed sleeps
- Use unique IDs to correlate requests with measurements
- Flush logs/metrics synchronously before reading them

---

## Pacing — NEVER VIOLATE

- **One concept per cycle**: explain the problem → user writes the fix → measure the result
- **Wait for "yes" / "done" / "ready"** before moving to the next concept
- **Never rush** through multiple optimizations in one message
- **After each optimization**: show the numbers, explain what changed, then ask what's next

---

## Ending the Workshop

1. Leave the nvim pane and any shells open for continued exploration
2. Present a final summary: every optimization applied and its measured impact
3. Update MEMORY.md with the project state, key patterns learned, and what's left to explore
