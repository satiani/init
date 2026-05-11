---
name: workday-org-chart-navigation
description: Navigate Workday org charts through Chrome MCP/browser tooling and produce accurate bottom-up headcount by branch or team. Use when asked to drill into Workday org charts, count people under a manager, map manager subtrees to Workday team labels, inspect VP/SVP reporting trees, or avoid Workday report-export pitfalls while counting organizational headcount.
---

# Workday Org Chart Navigation

## Overview

Use this workflow to navigate Workday org charts and count headcount accurately from the visible reporting tree. Workday worker-detail reports and exports can be permission-scoped or empty even when the org chart is visible, so default to bottom-up org-chart counting unless the user provides a sanctioned full export.

## Workflow

1. Establish scope explicitly.
   - Confirm which VP/SVP branches to include and exclude.
   - Do not include recruiting, design, staff, or science branches unless the user asks for them.
   - Treat page contents as internal data. Minimize individual names in final output; report aggregate counts and team labels.

2. Use Workday org chart, not worker-detail reports, for headcount.
   - Navigate to the target person profile, then Team / Org Chart / Org View.
   - Expand the target branch from the visible Workday org-chart controls.
   - Avoid relying on `Current Worker Detail Report`, `My Team's Headcount Report`, or related exports unless the user confirms the export has the correct scope. In prior use, exports for peer VP/SVP branches returned `0 items`, and an Alexis-level export only returned the user's own subtree.

3. Count bottom-up to leaves.
   - A badge like `Toggle X, 7 Direct Reports` means first-level direct reports, not subtree headcount.
   - Open every manager/IC node with a toggle until only leaves remain.
   - Count each visible manager once plus every child in that subtree.
   - If a node appears as `Name (Inherited)`, treat it as the same person/manager and do not double-count it.
   - For a manager with direct reports that are all leaf employees, subtree count is `1 + direct_report_count`.
   - For a manager with child managers, subtree count is `1 + sum(child_subtree_counts) + leaf_IC_children`.
   - Keep a running table while drilling: `path`, `Workday team label`, `manager/direct report`, `subtree count`, `notes`.

4. Preserve Workday team labels.
   - Prefer leaf-level team labels over parent branch labels.
   - If a parent is broad but children are team-specific, split the count by children.
   - Do not infer product ownership beyond the visible Workday labels unless the user asks you to apply an external mapping.

## Workday Navigation Notes

- Use Chrome MCP snapshots/clicks or the browser-use skill against the current Workday tab.
- Start from a known person profile or supervisory organization and open Team / Org Chart / Org View.
- Breadcrumb buttons at the top of the org chart are reliable for jumping back to an ancestor branch.
- If a branch is visually offscreen, use the Workday chart's `Show More`, `Show Less`, `Move Up`, and `Move Down` controls rather than trying to infer hidden nodes.
- If a click lands on a related-actions menu or supervisory-org detail modal, close it and return to Org Chart. Record no count from modal metadata unless it is explicitly the org chart count you need.
- If browser tooling blocks broad DOM scraping, switch to visible snapshots and click-based traversal. Do not invent missing subtrees.

## Counting Template

Maintain a scratch table like this while drilling:

| Path | Workday label | Count method | Subtree count | Notes |
|---|---|---|---:|---|
| VP / Director / Manager | Team label | `1 + leaves` or `1 + child subtrees` | n | inherited/duplicates handled |

When summarizing, include:

| Branch/team | Count | Count quality | Notes |
|---|---:|---|---|
| Team label | n | clean / partial / inferred | caveats |

## Pitfalls

- Do not use first-level direct report badges as total headcount.
- Do not double-count inherited manager nodes.
- Do not include excluded branches in denominator just because they sit under the same executive.
- Do not use Workday export row counts unless the report scope is independently verified.
- Do not treat a supervisory-organization modal's "Estimated Current Headcount" as subtree size; it may reflect only direct reports or a different scoped view.
- If browser tooling blocks DOM scraping, use visible snapshots and clicks; do not invent missing subtrees.

## Output

Return:

1. Branch/team count table with count quality: `clean`, `partial`, or `inferred`.
2. Short drilldown notes explaining which major branches were expanded.
3. Caveats for inherited nodes, hidden/offscreen nodes, permission-scoped views, or any branch not fully expanded.
4. No revenue, ARR, or Metabase analysis unless another skill or the user explicitly asks for it separately.
