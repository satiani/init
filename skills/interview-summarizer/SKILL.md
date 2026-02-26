---
name: interview-summarizer
description: Summarizes an interview transcript into a chronological bullet-point list for use in a hiring scorecard. Use when the user pastes or provides an interview transcript and asks for a summary.
---

# Interview Summarizer

Produce a chronological, bullet-point summary of an interview transcript for use in a Datadog hiring scorecard.

## Input

The user will provide a raw interview transcript. It may include timestamps and speaker labels.

## Output Rules

Follow these rules strictly:

1. **Chronological only** — walk through the conversation in the order it happened. Do NOT group by theme, category, or competency.

2. **No opening sentence** — do NOT write a preamble, header, or summarizing intro line. Start directly with the first bullet point.

3. **Specific, not generic** — each bullet should capture the actual detail the candidate gave: names, systems, numbers, anecdotes, outcomes. A good bullet conveys what was actually said, not just the topic it falls under.
   - ✅ "Candidate described building a GPU-based inferencing platform (vLLM + KubeRay) that enabled all CorpX teams to ship AI workloads, deployed across 20+ regions and on-prem, solving a prior limitation where even basic ML models couldn't run on a CorpX node."
   - ❌ "Candidate discussed their infrastructure work at CorpX."

4. **1–2 sentences per bullet** — keep each bullet tight. If a topic warrants more, split it into two consecutive bullets.

5. **Refer to the interviewer as "me"** — because the output will be submitted as the interviewer's own scorecard notes. E.g. "I asked about on-call experience" or "Candidate told me about…"

6. **Cover everything of substance** — include the candidate's intro, motivation for leaving, every question I asked and the key answer given, any specific examples or stories shared, and the Q&A at the end where the candidate asked me questions.

7. **Skip pure pleasantries** — omit "hello, how are you" exchanges and other zero-content filler, but do capture anything substantive said even briefly.

## Process

1. Read the full transcript carefully from top to bottom.
2. Identify each distinct topic or exchange as it occurs in sequence.
3. Write one bullet (or two if needed) per distinct topic, following the output rules above.
4. Output only the bullet list — no title, no intro paragraph, no closing commentary.
5. After producing the summary, copy it to the clipboard by running:
   ```bash
   echo "<full summary text>" | pbcopy
   ```
   Then tell the user the summary is ready and has been copied to their clipboard.

## Example of a Good vs. Bad Bullet

**Transcript excerpt:** "The candidate described managing a direct report named Cathy who was frequently talked over by Bryan in meetings. The candidate noticed the pattern, pulled Bryan aside privately, named the specific behavior, and coached him on it."

✅ Good: "Candidate described managing Cathy and helping her overcome a recurring issue where Bryan talked over her in meetings. They pulled Bryan aside privately, named the specific behavior, and coached him on it."

❌ Bad: "Candidate spoke about managing interpersonal conflicts on their team."
