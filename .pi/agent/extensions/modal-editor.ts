/**
 * Modal Editor - vim-like modal editing for pi
 *
 * Usage: pi --extension ./modal-editor.ts
 *   or place in ~/.pi/agent/extensions/
 *
 * Modes:
 *   INSERT  - Normal typing (default). Escape → NORMAL mode.
 *   NORMAL  - Vim-style navigation and editing. Escape → abort agent.
 *
 * Normal mode keys:
 *
 *   Navigation:
 *     h/j/k/l       - left/down/up/right
 *     w W e E        - word forward
 *     b B            - word backward
 *     0 ^            - line start
 *     $              - line end
 *     G              - go to end of document
 *     gg             - go to start of document
 *
 *   Editing:
 *     x              - delete char forward
 *     X              - delete char backward
 *     D              - delete to end of line
 *     C              - change to end of line (delete + insert)
 *     S / cc         - change entire line
 *     s              - change char (delete char + insert)
 *     u              - undo
 *     p              - paste (yank from kill ring)
 *     J              - join current line with next
 *     r{char}        - replace char under cursor
 *
 *   Operators (+ motion):
 *     d{motion}      - delete: dw db d$ d0 dd dh dl de dW dB dE
 *     c{motion}      - change: cw cb c$ c0 cc ch cl ce cW cB cE
 *
 *   Mode switches:
 *     i              - insert before cursor
 *     a              - insert after cursor
 *     I              - insert at line start
 *     A              - insert at line end
 *     o              - open line below
 *     O              - open line above
 *
 *   All ctrl+key shortcuts (ctrl+c, ctrl+l, etc.) work in both modes.
 */

import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// Terminal escape sequences that map to default editor keybindings.
// These are processed by Editor.handleInput via the keybindings manager.
const SEQ = {
	left: "\x1b[D", // left arrow  → cursorLeft
	right: "\x1b[C", // right arrow → cursorRight
	up: "\x1b[A", // up arrow    → cursorUp
	down: "\x1b[B", // down arrow  → cursorDown
	home: "\x01", // ctrl+a      → cursorLineStart
	end: "\x05", // ctrl+e      → cursorLineEnd
	del: "\x1b[3~", // delete key  → deleteCharForward
	bs: "\x7f", // backspace   → deleteCharBackward
	wordLeft: "\x1bb", // alt+b       → cursorWordLeft
	wordRight: "\x1bf", // alt+f       → cursorWordRight
	delWordBack: "\x17", // ctrl+w      → deleteWordBackward
	delWordFwd: "\x1bd", // alt+d       → deleteWordForward
	delToEnd: "\x0b", // ctrl+k      → deleteToLineEnd
	delToStart: "\x15", // ctrl+u      → deleteToLineStart
	yank: "\x19", // ctrl+y      → yank
	undo: "\x1f", // ctrl+_      → undo
	newLine: "\n", // LF          → newLine (addNewLine)
} as const;

class ModalEditor extends CustomEditor {
	private mode: "normal" | "insert" = "insert";
	private pending: string | null = null; // operator pending: "d", "c", "g", "r"

	handleInput(data: string): void {
		// Escape: insert→normal, normal→pass through (abort agent, etc.)
		if (matchesKey(data, "escape")) {
			if (this.mode === "insert") {
				this.mode = "normal";
				this.pending = null;
			} else {
				this.pending = null;
				super.handleInput(data);
			}
			return;
		}

		// Insert mode: pass everything through to the editor
		if (this.mode === "insert") {
			super.handleInput(data);
			return;
		}

		// Normal mode with operator pending (d, c, g, r)
		if (this.pending) {
			this.handleOperatorPending(data);
			return;
		}

		// Normal mode
		this.handleNormalMode(data);
	}

	/** Send an escape sequence through to the editor */
	private send(seq: string): void {
		super.handleInput(seq);
	}

	private enterInsert(): void {
		this.mode = "insert";
	}

	/**
	 * Vim-style `w` movement: move to the start of the next word.
	 *
	 * The editor's built-in word-right (Emacs-style) stops at the *end* of
	 * the current word (i.e. on the space).  Vim's `w` skips past the
	 * trailing whitespace too, landing on the first character of the next word.
	 */
	private vimWordForward(): void {
		this.send(SEQ.wordRight); // skip current word → lands on space/punct/EOL

		// If we landed on whitespace, advance to the next non-whitespace char
		for (let i = 0; i < 200; i++) {
			const lines = this.getLines();
			const cur = this.getCursor();
			const line = lines[cur.line] || "";

			if (cur.col >= line.length) {
				// End of line – wrap to next line if one exists
				if (cur.line < lines.length - 1) {
					this.send(SEQ.down);
					this.send(SEQ.home);
				}
				break;
			}

			const ch = line[cur.col]!;
			if (ch !== " " && ch !== "\t") break; // on a word char – done
			this.send(SEQ.right);
		}
	}

	/**
	 * Vim-style `dw`: delete from cursor to start of next word
	 * (includes trailing whitespace, matching vim behaviour).
	 */
	private vimDeleteWordForward(): void {
		this.send(SEQ.delWordFwd); // delete current word

		// If cursor is now on whitespace, keep deleting char-by-char
		for (let i = 0; i < 200; i++) {
			const lines = this.getLines();
			const cur = this.getCursor();
			const line = lines[cur.line] || "";
			if (cur.col >= line.length) break;

			const ch = line[cur.col]!;
			if (ch !== " " && ch !== "\t") break;
			this.send(SEQ.del);
		}
	}

	private handleNormalMode(data: string): void {
		switch (data) {
			// ── Navigation ──────────────────────────────────
			case "h":
				this.send(SEQ.left);
				break;
			case "j":
				this.send(SEQ.down);
				break;
			case "k":
				this.send(SEQ.up);
				break;
			case "l":
				this.send(SEQ.right);
				break;
			case "w":
			case "W":
				this.vimWordForward();
				break;
			case "e":
			case "E":
				this.send(SEQ.wordRight);
				break;
			case "b":
			case "B":
				this.send(SEQ.wordLeft);
				break;
			case "0":
			case "^":
				this.send(SEQ.home);
				break;
			case "$":
				this.send(SEQ.end);
				break;
			case "G": {
				// Go to end of document
				const lineCount = this.getLines().length;
				for (let i = 0; i < lineCount; i++) this.send(SEQ.down);
				this.send(SEQ.end);
				break;
			}

			// ── Editing ─────────────────────────────────────
			case "x":
				this.send(SEQ.del);
				break;
			case "X":
				this.send(SEQ.bs);
				break;
			case "D":
				this.send(SEQ.delToEnd);
				break;
			case "C":
				this.send(SEQ.delToEnd);
				this.enterInsert();
				break;
			case "S":
				this.send(SEQ.home);
				this.send(SEQ.delToEnd);
				this.enterInsert();
				break;
			case "s":
				this.send(SEQ.del);
				this.enterInsert();
				break;
			case "u":
				this.send(SEQ.undo);
				break;
			case "p":
				this.send(SEQ.yank);
				break;
			case "J": {
				// Join current line with next line
				this.send(SEQ.end);
				this.send(SEQ.delToEnd); // at end of line, this merges with next
				break;
			}

			// ── Mode switches ───────────────────────────────
			case "i":
				this.enterInsert();
				break;
			case "a":
				this.send(SEQ.right);
				this.enterInsert();
				break;
			case "A":
				this.send(SEQ.end);
				this.enterInsert();
				break;
			case "I":
				this.send(SEQ.home);
				this.enterInsert();
				break;
			case "o":
				this.send(SEQ.end);
				this.send(SEQ.newLine);
				this.enterInsert();
				break;
			case "O":
				this.send(SEQ.home);
				this.send(SEQ.newLine);
				this.send(SEQ.up);
				this.enterInsert();
				break;

			// ── Operators (wait for motion) ─────────────────
			case "d":
			case "c":
			case "g":
			case "r":
				this.pending = data;
				break;

			// ── Pass control sequences, ignore other printable chars ──
			default:
				if (data.length === 1 && data.charCodeAt(0) >= 32) return;
				super.handleInput(data);
		}
	}

	private handleOperatorPending(data: string): void {
		const op = this.pending!;
		this.pending = null;

		// ── g prefix ────────────────────────────────────
		if (op === "g") {
			if (data === "g") {
				// gg: go to start of document
				const lineCount = this.getLines().length;
				for (let i = 0; i < lineCount; i++) this.send(SEQ.up);
				this.send(SEQ.home);
			}
			// Unknown g-combo: silently ignore
			return;
		}

		// ── r prefix (replace char) ─────────────────────
		if (op === "r") {
			if (data.length === 1 && data.charCodeAt(0) >= 32) {
				this.send(SEQ.del); // delete char under cursor
				super.handleInput(data); // insert replacement
				this.send(SEQ.left); // move back onto it
			}
			return;
		}

		// ── d / c operator + motion ─────────────────────
		const enterInsert = op === "c";

		switch (data) {
			// Word motions
			case "w":
			case "W":
				this.vimDeleteWordForward();
				break;
			case "e":
			case "E":
				this.send(SEQ.delWordFwd);
				break;
			case "b":
			case "B":
				this.send(SEQ.delWordBack);
				break;

			// Line extent motions
			case "$":
				this.send(SEQ.delToEnd);
				break;
			case "0":
			case "^":
				this.send(SEQ.delToStart);
				break;

			// Character motions
			case "h":
				this.send(SEQ.bs);
				break;
			case "l":
				this.send(SEQ.del);
				break;

			// Doubled operator: dd / cc (delete/change entire line)
			case "d":
			case "c":
				if (data === op) {
					this.deleteCurrentLine();
				}
				break;

			default:
				// Unknown motion - cancel operator
				return;
		}

		if (enterInsert) {
			this.enterInsert();
		}
	}

	/** Delete the entire current line (for dd / cc) */
	private deleteCurrentLine(): void {
		const lines = this.getLines();
		const cursor = this.getCursor();

		if (lines.length === 1) {
			// Only line in the editor - just clear its content
			this.send(SEQ.home);
			this.send(SEQ.delToEnd);
		} else if (cursor.line < lines.length - 1) {
			// Not the last line - delete content then merge next line up
			this.send(SEQ.home);
			this.send(SEQ.delToEnd); // clears line content
			this.send(SEQ.delToEnd); // at empty line end, merges next line up
		} else {
			// Last line - delete content then merge into previous line
			this.send(SEQ.home);
			this.send(SEQ.delToEnd); // clears line content
			this.send(SEQ.bs); // at empty line start, merges with previous line
		}
	}

	render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) return lines;

		// Build mode indicator for the bottom border
		let label: string;
		if (this.pending) {
			label = ` ${this.pending.toUpperCase()}… `;
		} else {
			label = this.mode === "normal" ? " NORMAL " : " INSERT ";
		}

		const last = lines.length - 1;
		if (visibleWidth(lines[last]!) >= label.length) {
			lines[last] = truncateToWidth(lines[last]!, width - label.length, "") + label;
		}
		return lines;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, kb) => new ModalEditor(tui, theme, kb));
	});
}
