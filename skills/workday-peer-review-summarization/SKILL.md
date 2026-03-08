---
name: workday-peer-review-summarization
description: >
  Summarizes Peer & Upward Feedback from an open Workday manager-evaluation tab into strengths and development categories with selective direct quotes, then optionally writes the result back into the Performance Feedback Questions fields. Use when the user asks for help with Workday performance reviews, peer feedback, upward feedback, manager evaluations, or asks you to read the currently open Workday tab.
compatibility: Requires browser automation access and a logged-in Workday tab.
---

# Workday Peer Review Summarization

Use this skill to extract peer and upward feedback from Workday quickly and turn it into a manager-ready summary with direct quotes, while avoiding browser thrash and unnecessary exploration.

Core priorities, in order:
1. Reach the correct Workday section fast.
2. Extract the full feedback set, even when the table is virtualized.
3. Prefer high-signal open-ended feedback and avoid low-signal survey rows by default.
4. Pick selective quotes that preserve concrete anecdotes.
5. Make quote revision easy after the first draft.
6. If writing back into Workday, validate formatting and do not save unless explicitly asked.

## Default assumptions

Unless the user asks otherwise:
- summarize feedback from the currently open Workday tab
- use 2-3 excellence categories and 1-2 improvement categories
- use category headers plus bullet lists of quotes
- do not include author attributions like "one peer" or "his manager"
- do not add summary paragraphs beneath each category
- do not save or submit Workday changes
- do not take screenshots unless the user explicitly asks for one
- after showing the first draft, expect quote-level refinement requests and handle them by revising only the targeted quote unless the user asks for a broader rewrite

## Intent resolution rules

Use these rules to remove ambiguity about what to do next:
- If the user asks to `do the peer summary`, `summarize this page`, `read this Workday page`, or similar, that means:
  1. select the current Workday evaluation tab
  2. navigate to `Peer & Upward Feedback` even if the tab initially opens on `Performance Feedback Questions`
  3. extract the feedback rows
  4. return the structured summary in chat only
- If the user follows the summary with `go ahead`, `proceed`, `write it`, `put it in Workday`, or equivalent, that means:
  1. navigate back to `Performance Feedback Questions`
  2. write the already-approved draft into the two Manager answer fields
  3. validate the fields
  4. stop before clicking `Save`
- If the user says `save` or `submit`, click that control only after validation has already passed.
- Do not reinterpret a plain `go ahead` after the summary as permission to save; it only means write back and validate.

## Fast path workflow

1. **Open the correct tab with minimal discovery**
   - List browser pages once.
   - Select the Workday tab (`myworkday.com`) that looks like a manager evaluation or performance feedback task.
   - Take a snapshot immediately after selecting it.

2. **Go straight to Peer & Upward Feedback**
   - Use the left-nav `Peer & Upward Feedback` button first.
   - If a plain click only focuses the item and does not navigate, use keyboard activation on the focused item (`Enter`).
   - Use the same click-then-`Enter` rule later when going back to `Performance Feedback Questions`.
   - After navigation, confirm success by checking that the page title or visible section heading is exactly `Peer & Upward Feedback`.
   - If the reading pane goes temporarily blank after the click, treat that as a normal loading state and wait for the target heading instead of assuming failure.
   - Use target-specific waits only. Do not wait on both the old and new section names at the same time.
   - Do not detour into print views, network inspection, or iframe spelunking unless the section truly cannot be reached after click + Enter + brief wait.
   - If you hit a wall, try refreshing the page.

3. **Extract feedback from the rendered grid, not by manual browsing**
   - Prefer DOM extraction from Workday's rendered rows.
   - First try:
     - `[data-automation-id="row"]`
     - nested `[data-automation-id="cell"]`
   - Normalize rows into:
     - `question`
     - `response`
     - `from`
   - Workday often repeats the question only on the first row of each section; carry forward the last non-empty question when later rows have a blank question cell.
   - Compare the number of extracted responses with the Workday item count label (for example `11 items`). If they match, proceed. If the extraction returns fewer rows than the label, assume the grid is virtualized and use the scroll-collection snippet below.

4. **Filter for signal before choosing quotes**
   - First separate high-signal open-ended rows from low-signal survey rows.
   - Use high-signal rows as the quote pool by default.
   - Treat short stock responses like `I am supported in this area.` or `I need stronger support in this area.` as secondary evidence, not default quotes.

5. **Draft compact categories and quotes**
   - Build the category structure.
   - Pick quotes.
   - Only after the quote set feels final should you move into Workday write-back.

6. **If the user tunes quotes, revise surgically**
   - If the user asks to make one quote longer or shorter, revise that quote first.
   - Do not regenerate the entire summary unless the user asks.
   - If the user says the quotes look good or says to proceed, write back immediately without re-asking for another confirmation.

## Preferred DOM extraction snippet

Use this as the first extraction attempt on the Peer & Upward Feedback page:

```js
() => {
  const rows = Array.from(document.querySelectorAll('[data-automation-id="row"]'));
  let lastQuestion = "";

  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll('[data-automation-id="cell"]'))
        .map((cell) => (cell.innerText || cell.textContent || '').trim());

      const question = cells[0] || lastQuestion;
      const response = cells[1] || "";
      const from = cells[2] || "";

      if (cells[0]) lastQuestion = cells[0];
      return { question, response, from };
    })
    .filter((row) => row.response);
}
```

Use the extracted rows as the source of truth before trying slower fallbacks.

## Virtualized table collection snippet

Workday frequently renders only part of the table into the DOM. If the grid header says something like `35 items` but the first extraction returns fewer rows, use this snippet next:

```js
async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wrapper = document.querySelector('[data-automation-id="tableWrapper"]');
  if (!wrapper) return { error: 'tableWrapper not found' };

  const extract = () => {
    const rows = Array.from(document.querySelectorAll('[data-automation-id="row"]'));
    let lastQuestion = '';
    return rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll('[data-automation-id="cell"]'))
          .map((cell) => (cell.innerText || cell.textContent || '').trim());
        const question = cells[0] || lastQuestion;
        const response = cells[1] || '';
        const from = cells[2] || '';
        if (cells[0]) lastQuestion = cells[0];
        return { question, response, from };
      })
      .filter((row) => row.response);
  };

  const seen = new Map();
  const maxScroll = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
  const step = Math.max(200, Math.floor(wrapper.clientHeight * 0.8));

  wrapper.scrollTop = 0;
  await sleep(200);

  for (let y = 0; y <= maxScroll + step; y += step) {
    wrapper.scrollTop = Math.min(y, maxScroll);
    wrapper.dispatchEvent(new Event('scroll', { bubbles: true }));
    await sleep(200);

    for (const row of extract()) {
      seen.set(JSON.stringify(row), row);
    }
  }

  return { count: seen.size, rows: Array.from(seen.values()) };
}
```

Prefer this deterministic scroll-collection flow over guessing about hidden rows.

## Extraction and filtering rules

Only use material from **Peer & Upward Feedback**.
Do **not** mix in:
- employee self-evaluation text
- manager prompts
- performance indicator content
- review-and-submit content

Prioritize row types in this order:
1. **Open-ended free-text questions** such as:
   - `What is one thing this employee should continue doing well?`
   - `What is one thing this employee should start doing differently?`
   - `What is one thing your manager should continue doing well?`
   - `What is one thing your manager should start doing differently?`
2. **Longer free-text responses** on any equivalent prompt.
3. **Short survey-style responses** like:
   - `I am supported in this area.`
   - `I need stronger support in this area.`

Default behavior:
- Use open-ended free-text rows as the quote source.
- Do **not** quote survey-style rows by default unless the user asks for a pulse/survey summary or there is no better evidence.
- Ignore generic non-actionable responses like `Nothing currently...` unless improvement feedback is otherwise absent.
- If peer feedback and upward feedback support the same theme, you may combine them under one category.

Map feedback into:
- **Areas of Excellence** from the `continue doing well` responses
- **Areas of Improvement** from the `start doing differently` responses

## Quote selection rules

These rules are mandatory. Follow them by default so the user does not need to steer you again.

### 1. Keep quotes selective
- Usually choose **2-3 quotes per category**.
- Prefer fewer strong quotes over many repetitive ones.
- Avoid giant blocks when a shorter excerpt preserves the same signal.

### 2. Preserve specificity
Keep concrete details that make the feedback real and useful, such as:
- named incidents
- sprint names
- product names
- feature names
- customer anecdotes
- specific proposals or UI ideas

If trimming a quote removes the anecdote or the `why it mattered`, the quote is now too short.

### 3. Trim aggressively but safely
When a quote is too long:
- keep the shortest span that preserves:
  - the core behavior
  - the specific anecdote or situation
  - the outcome or implication
- remove filler, repeated framing, and generic preamble
- if needed, use `...` sparingly and only when meaning remains intact

Do **not** over-trim a quote into something generic and context-free.

### 4. Anonymize only the author
- Do not identify who wrote the quote.
- Do not say:
  - `one peer`
  - `another peer`
  - `his manager`
  - `a reviewer said`
- Names that already appear **inside** the quote may stay if they are part of the quoted feedback.

### 5. Do not add redundant context labels
If the quote already contains the context, do not prepend labels like:
- `Referencing incident X:`
- `About the sprint:`
- `During project Y:`

Only add context outside the quote if the quote is otherwise impossible to understand.

### 6. No fake quotes
- Do not paraphrase and put it in quotation marks.
- Use direct quoted text only.
- If you need to summarize a theme, do it outside quotation marks.

## Quote revision workflow

Treat quote revision as a normal part of the workflow.

- If the user asks to make a quote longer, return the longer quote first.
- If the user asks to make a quote shorter, tighten only that quote first.
- If the user corrects which quote they meant, accept the correction directly and replace only that quote.
- After a targeted revision, offer to update the full section or Workday fields with the revised quote.
- Once the user says the quotes look good, stop re-litigating the selection and move straight to the next requested step.

## Output format defaults

### Summary in chat
Use this shape by default:

- `Areas of Excellence`
  - `Category Name`
  - `Selected quotes:`
    - `"Quote 1"`
    - `"Quote 2"`
- blank line between categories
- `Areas of Improvement`
  - same structure

Do not include a paragraph summary under each category unless the user explicitly asks.

### Writing into Workday
Use this exact structure in each manager answer field:

- bold category header
- plain text line: `Selected quotes:`
- bullet list of quotes
- blank line between categories

Do **not** bold `Selected quotes:`.

## Recommended category pattern

For most reviews:
- Excellence: 2-3 categories
  - for example: leadership/clarity, execution/ownership, innovation/product thinking
- Improvement: 1-2 categories
  - for example: sharing vision earlier, driving from prototype to adoption

Adjust category names to fit the actual feedback, but keep the structure compact.

## Workday write-back workflow

Only do this if the user asks you to populate the Workday fields.

1. **Navigate back to `Performance Feedback Questions`**.
   - Click the left-nav button first.
   - If that only focuses the item, press `Enter`.
   - Wait until the page title or visible section heading is exactly `Performance Feedback Questions`.
   - If the reading pane goes briefly blank during navigation, wait for the target heading instead of treating it as failure.
   - Take a fresh snapshot after the page loads.

2. **Reuse the approved draft exactly as-is**.
   - If the user just said `go ahead` after reviewing the summary, insert that exact draft.
   - Do not regenerate categories, swap quotes, or restyle the content during write-back unless the user explicitly asked for revisions.

3. **Find the two editable rich text editors in the manager section**.
   - First editor = strengths
   - Second editor = development areas

4. **Render structured HTML compatible with Workday's ProseMirror fields**.
   - category header paragraph with bold text
   - plain `Selected quotes:` paragraph
   - `<ul><li>...</li></ul>` for quotes
   - blank paragraph between categories

5. **Insert content deterministically**.
   - Focus the editor.
   - Select all existing editor contents.
   - Clear the selection.
   - Use `document.execCommand('insertHTML', false, html)` to insert the structured HTML.
   - Dispatch `input`, `change`, and `blur` events.

6. **Validate after insertion**.
   - both editors show content
   - both editors have `aria-invalid="false"`
   - the rendered accessibility tree shows `list` and `listitem` nodes for quotes
   - there is no visible error banner like `The field Answer is required and must have a value.`
   - `Save` is enabled
   - rely on DOM state and validation state; do not take screenshots for confirmation

7. **If validation still fails, repair with a no-op real edit**.
   - This commonly happens when content is visibly present but Workday still thinks the field is empty.
   - Focus the exact invalid editor.
   - Perform a no-op user edit such as: type one space, then delete it.
   - Re-check `aria-invalid`, the error banner, and whether `Save` is enabled.
   - Trust validation state, not just visible content.

8. **Do not click `Save` or `Submit` unless the user explicitly tells you to**.

## Preferred editor selection snippet

Use this as the first editor lookup attempt on Performance Feedback Questions:

```js
() => {
  return Array.from(
    document.querySelectorAll('[data-automation-id="richTextContent"] .ProseMirror[contenteditable="true"]')
  );
}
```

Expected ordering:
- index 0 = manager strengths answer
- index 1 = manager development answer

## Preferred HTML insertion snippet

Use this insertion pattern before trying heavier alternatives:

```js
(editor, html) => {
  editor.scrollIntoView({ block: 'center' });
  editor.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);

  document.execCommand('delete', false);
  document.execCommand('insertHTML', false, html);

  editor.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertHTML',
    data: null,
  }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  editor.dispatchEvent(new Event('blur', { bubbles: true }));
}
```

## Workday-specific friction handling

### Navigation friction
If Workday does not switch sections on click:
- keep focus on the nav item
- press `Enter`
- retry once before using heavier fallbacks

### Virtualized table friction
If the header says more items exist than the simple DOM extraction returned:
- assume virtualization immediately
- use the table-wrapper scroll collector
- do not guess based on partially rendered rows

### Survey-row friction
If the table mixes long-form feedback with many short `I am supported in this area.` rows:
- treat the short rows as low-signal by default
- choose quotes from the long-form rows first
- use survey rows only as secondary supporting evidence

### Validation friction
If a field shows content but still appears invalid after programmatic insertion:
- focus the exact invalid editor
- perform a no-op edit (for example: insert a space, then delete it)
- re-check `aria-invalid`
- re-check for the error banner
- re-check whether `Save` is enabled

### DOM extraction first, not last
If the peer feedback grid is visible:
- extract rows programmatically first
- do not waste time with print, network, or alternate document views unless the DOM extraction fails

## Fallbacks

Use these only if the fast path fails:

1. take a fresh snapshot
2. wait briefly for Workday to finish rendering
3. retry click + Enter on the nav item
4. use the virtualized grid collector if the visible row count looks incomplete
5. if the grid still is not extractable, manually inspect visible rows from the snapshot
6. ask the user for a refresh only after these steps

## Final response discipline

When the task is summarization only:
- return the structured summary
- keep it concise
- make quote choices feel final, not exploratory

When the task includes writing into Workday:
- say what was written
- say whether validation passed
- say whether Save was clicked
- do not mention screenshots unless the user explicitly asked for one

When the user has just approved the quotes and asked to proceed:
- write back immediately
- validate
- report status
- do not ask an extra confirmation question before acting
