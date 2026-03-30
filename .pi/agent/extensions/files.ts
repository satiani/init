/**
 * Files Extension
 *
 * /files command lists files referenced in the current session
 * and offers quick actions like reveal, open, or edit.
 */

import { spawnSync } from "node:child_process";
import {
	existsSync,
	readFileSync,
	realpathSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
	Container,
	fuzzyFilter,
	getKeybindings,
	Input,
	type SelectItem,
	SelectList,
	Spacer,
	Text,
	type TUI,
} from "@mariozechner/pi-tui";

type ContentBlock = {
	type?: string;
	text?: string;
	arguments?: Record<string, unknown>;
};

type FileReference = {
	path: string;
	display: string;
	exists: boolean;
	isDirectory: boolean;
};

type FileEntry = {
	canonicalPath: string;
	resolvedPath: string;
	displayPath: string;
	exists: boolean;
	isDirectory: boolean;
	isReferenced: boolean;
	hasSessionChange: boolean;
	lastTimestamp: number;
};

type FileToolName = "write" | "edit";

type SessionFileChange = {
	operations: Set<FileToolName>;
	lastTimestamp: number;
};

const FILE_TAG_REGEX = /<file\s+name=["']([^"']+)["']>/g;
const FILE_URL_REGEX = /file:\/\/[^\s"'<>]+/g;
const PATH_REGEX = /(?:^|[\s"'`([{<])((?:~|\/)[^\s"'`<>)}\]]+)/g;

const MAX_EDIT_BYTES = 40 * 1024 * 1024;

const extractFileReferencesFromText = (text: string): string[] => {
	const refs: string[] = [];

	for (const match of text.matchAll(FILE_TAG_REGEX)) {
		refs.push(match[1]);
	}

	for (const match of text.matchAll(FILE_URL_REGEX)) {
		refs.push(match[0]);
	}

	for (const match of text.matchAll(PATH_REGEX)) {
		refs.push(match[1]);
	}

	return refs;
};

const extractPathsFromToolArgs = (args: unknown): string[] => {
	if (!args || typeof args !== "object") {
		return [];
	}

	const refs: string[] = [];
	const record = args as Record<string, unknown>;
	const directKeys = ["path", "file", "filePath", "filepath", "fileName", "filename"] as const;
	const listKeys = ["paths", "files", "filePaths"] as const;

	for (const key of directKeys) {
		const value = record[key];
		if (typeof value === "string") {
			refs.push(value);
		}
	}

	for (const key of listKeys) {
		const value = record[key];
		if (Array.isArray(value)) {
			for (const item of value) {
				if (typeof item === "string") {
					refs.push(item);
				}
			}
		}
	}

	return refs;
};

const extractFileReferencesFromContent = (content: unknown): string[] => {
	if (typeof content === "string") {
		return extractFileReferencesFromText(content);
	}

	if (!Array.isArray(content)) {
		return [];
	}

	const refs: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") {
			continue;
		}

		const block = part as ContentBlock;

		if (block.type === "text" && typeof block.text === "string") {
			refs.push(...extractFileReferencesFromText(block.text));
		}

		if (block.type === "toolCall") {
			refs.push(...extractPathsFromToolArgs(block.arguments));
		}
	}

	return refs;
};

const extractFileReferencesFromEntry = (entry: SessionEntry): string[] => {
	if (entry.type === "message") {
		return extractFileReferencesFromContent(entry.message.content);
	}

	if (entry.type === "custom_message") {
		return extractFileReferencesFromContent(entry.content);
	}

	return [];
};

const sanitizeReference = (raw: string): string => {
	let value = raw.trim();
	value = value.replace(/^["'`(<\[]+/, "");
	value = value.replace(/[>"'`,;).\]]+$/, "");
	value = value.replace(/[.,;:]+$/, "");
	return value;
};

const isCommentLikeReference = (value: string): boolean => value.startsWith("//");

const stripLineSuffix = (value: string): string => {
	let result = value.replace(/#L\d+(C\d+)?$/i, "");
	const lastSeparator = Math.max(result.lastIndexOf("/"), result.lastIndexOf("\\"));
	const segmentStart = lastSeparator >= 0 ? lastSeparator + 1 : 0;
	const segment = result.slice(segmentStart);
	const colonIndex = segment.indexOf(":");
	if (colonIndex >= 0 && /\d/.test(segment[colonIndex + 1] ?? "")) {
		result = result.slice(0, segmentStart + colonIndex);
		return result;
	}

	const lastColon = result.lastIndexOf(":");
	if (lastColon > lastSeparator) {
		const suffix = result.slice(lastColon + 1);
		if (/^\d+(?::\d+)?$/.test(suffix)) {
			result = result.slice(0, lastColon);
		}
	}
	return result;
};

const normalizeReferencePath = (raw: string, cwd: string): string | null => {
	let candidate = sanitizeReference(raw);
	if (!candidate || isCommentLikeReference(candidate)) {
		return null;
	}

	if (candidate.startsWith("file://")) {
		try {
			candidate = fileURLToPath(candidate);
		} catch {
			return null;
		}
	}

	candidate = stripLineSuffix(candidate);
	if (!candidate || isCommentLikeReference(candidate)) {
		return null;
	}

	if (candidate.startsWith("~")) {
		candidate = path.join(os.homedir(), candidate.slice(1));
	}

	if (!path.isAbsolute(candidate)) {
		candidate = path.resolve(cwd, candidate);
	}

	candidate = path.normalize(candidate);
	const root = path.parse(candidate).root;
	if (candidate.length > root.length) {
		candidate = candidate.replace(/[\\/]+$/, "");
	}

	return candidate;
};

const formatDisplayPath = (absolutePath: string, cwd: string): string => {
	const normalizedCwd = path.resolve(cwd);
	if (absolutePath.startsWith(normalizedCwd + path.sep)) {
		return path.relative(normalizedCwd, absolutePath);
	}

	return absolutePath;
};

const collectRecentFileReferences = (entries: SessionEntry[], cwd: string, limit: number): FileReference[] => {
	const results: FileReference[] = [];
	const seen = new Set<string>();

	for (let i = entries.length - 1; i >= 0 && results.length < limit; i -= 1) {
		const refs = extractFileReferencesFromEntry(entries[i]);
		for (let j = refs.length - 1; j >= 0 && results.length < limit; j -= 1) {
			const normalized = normalizeReferencePath(refs[j], cwd);
			if (!normalized || seen.has(normalized)) {
				continue;
			}

			seen.add(normalized);

			let exists = false;
			let isDirectory = false;
			if (existsSync(normalized)) {
				exists = true;
				const stats = statSync(normalized);
				isDirectory = stats.isDirectory();
			}

			results.push({
				path: normalized,
				display: formatDisplayPath(normalized, cwd),
				exists,
				isDirectory,
			});
		}
	}

	return results;
};

const findLatestFileReference = (entries: SessionEntry[], cwd: string): FileReference | null => {
	const refs = collectRecentFileReferences(entries, cwd, 100);
	return refs.find((ref) => ref.exists) ?? null;
};

const toCanonicalPath = (inputPath: string): { canonicalPath: string; isDirectory: boolean } | null => {
	if (!existsSync(inputPath)) {
		return null;
	}

	try {
		const canonicalPath = realpathSync(inputPath);
		const stats = statSync(canonicalPath);
		return { canonicalPath, isDirectory: stats.isDirectory() };
	} catch {
		return null;
	}
};

const collectSessionFileChanges = (entries: SessionEntry[], cwd: string): Map<string, SessionFileChange> => {
	const toolCalls = new Map<string, { path: string; name: FileToolName }>();

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const msg = entry.message;

		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === "toolCall") {
					const name = block.name as FileToolName;
					if (name === "write" || name === "edit") {
						const filePath = block.arguments?.path;
						if (filePath && typeof filePath === "string") {
							toolCalls.set(block.id, { path: filePath, name });
						}
					}
				}
			}
		}
	}

	const fileMap = new Map<string, SessionFileChange>();

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const msg = entry.message;

		if (msg.role === "toolResult") {
			const toolCall = toolCalls.get(msg.toolCallId);
			if (!toolCall) continue;

			const resolvedPath = path.isAbsolute(toolCall.path)
				? toolCall.path
				: path.resolve(cwd, toolCall.path);
			const canonical = toCanonicalPath(resolvedPath);
			if (!canonical) {
				continue;
			}

			const existing = fileMap.get(canonical.canonicalPath);
			if (existing) {
				existing.operations.add(toolCall.name);
				if (msg.timestamp > existing.lastTimestamp) {
					existing.lastTimestamp = msg.timestamp;
				}
			} else {
				fileMap.set(canonical.canonicalPath, {
					operations: new Set([toolCall.name]),
					lastTimestamp: msg.timestamp,
				});
			}
		}
	}

	return fileMap;
};

const buildFileEntries = (ctx: ExtensionContext): FileEntry[] => {
	const entries = ctx.sessionManager.getBranch();
	const sessionChanges = collectSessionFileChanges(entries, ctx.cwd);

	const fileMap = new Map<string, FileEntry>();

	const upsertFile = (data: Partial<FileEntry> & { canonicalPath: string; isDirectory: boolean }) => {
		const existing = fileMap.get(data.canonicalPath);
		const displayPath = data.displayPath ?? formatDisplayPath(data.canonicalPath, ctx.cwd);

		if (existing) {
			fileMap.set(data.canonicalPath, {
				...existing,
				...data,
				displayPath,
				exists: data.exists ?? existing.exists,
				isDirectory: data.isDirectory ?? existing.isDirectory,
				isReferenced: existing.isReferenced || data.isReferenced === true,
				hasSessionChange: existing.hasSessionChange || data.hasSessionChange === true,
				lastTimestamp: Math.max(existing.lastTimestamp, data.lastTimestamp ?? 0),
			});
			return;
		}

		fileMap.set(data.canonicalPath, {
			canonicalPath: data.canonicalPath,
			resolvedPath: data.resolvedPath ?? data.canonicalPath,
			displayPath,
			exists: data.exists ?? true,
			isDirectory: data.isDirectory,
			isReferenced: data.isReferenced ?? false,
			hasSessionChange: data.hasSessionChange ?? false,
			lastTimestamp: data.lastTimestamp ?? 0,
		});
	};

	// Session-referenced files
	const references = collectRecentFileReferences(entries, ctx.cwd, 200).filter((ref) => ref.exists);
	for (const ref of references) {
		const canonical = toCanonicalPath(ref.path);
		if (!canonical) continue;

		upsertFile({
			canonicalPath: canonical.canonicalPath,
			resolvedPath: canonical.canonicalPath,
			isDirectory: canonical.isDirectory,
			exists: true,
			isReferenced: true,
		});
	}

	// Session-changed files (write/edit tool calls)
	for (const [canonicalPath, change] of sessionChanges.entries()) {
		const canonical = toCanonicalPath(canonicalPath);
		if (!canonical) continue;

		upsertFile({
			canonicalPath: canonical.canonicalPath,
			resolvedPath: canonical.canonicalPath,
			isDirectory: canonical.isDirectory,
			exists: true,
			hasSessionChange: true,
			lastTimestamp: change.lastTimestamp,
		});
	}

	return Array.from(fileMap.values()).sort((a, b) => {
		if (a.hasSessionChange !== b.hasSessionChange) {
			return a.hasSessionChange ? -1 : 1;
		}
		if (a.lastTimestamp !== b.lastTimestamp) {
			return b.lastTimestamp - a.lastTimestamp;
		}
		if (a.isReferenced !== b.isReferenced) {
			return a.isReferenced ? -1 : 1;
		}
		return a.displayPath.localeCompare(b.displayPath);
	});
};

type EditCheckResult = {
	allowed: boolean;
	reason?: string;
	content?: string;
};

const getEditableContent = (target: FileEntry): EditCheckResult => {
	if (!existsSync(target.resolvedPath)) {
		return { allowed: false, reason: "File not found" };
	}

	const stats = statSync(target.resolvedPath);
	if (stats.isDirectory()) {
		return { allowed: false, reason: "Directories cannot be edited" };
	}

	if (stats.size >= MAX_EDIT_BYTES) {
		return { allowed: false, reason: "File is too large" };
	}

	const buffer = readFileSync(target.resolvedPath);
	if (buffer.includes(0)) {
		return { allowed: false, reason: "File contains null bytes" };
	}

	return { allowed: true, content: buffer.toString("utf8") };
};

// ── tmux helpers ──────────────────────────────────────────────────────────────

const shellEscape = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

type TmuxInfo = { paneId: string; windowId: string };

/**
 * Returns the pane ID and stable window ID for pi's own tmux pane.
 * Uses $TMUX_PANE (pi's pane, not the user's current focus) so the target
 * stays correct even after the user navigates to another window/pane.
 */
const getTmuxInfo = (): TmuxInfo | null => {
	const paneId = process.env.TMUX_PANE;
	if (!process.env.TMUX || !paneId) {
		return null;
	}
	const result = spawnSync("tmux", ["display-message", "-p", "-t", paneId, "#{window_id}"], {
		encoding: "utf8",
	});
	if (result.status !== 0) {
		return null;
	}
	const windowId = result.stdout.trim();
	return windowId ? { paneId, windowId } : null;
};

/** True when pi's window already has more than one pane (i.e. a neighbour exists). */
const tmuxWindowHasMultiplePanes = (windowId: string): boolean => {
	const result = spawnSync("tmux", ["list-panes", "-t", windowId, "-F", "#{pane_id}"], {
		encoding: "utf8",
	});
	if (result.status !== 0) {
		return false;
	}
	return result.stdout.trim().split("\n").filter(Boolean).length > 1;
};

/**
 * Opens shellCmd in a new tmux pane relative to pi's own pane.
 * – If pi's window already has a horizontal neighbour → split vertically (below).
 * – Otherwise → split horizontally (to the right).
 */
const openInTmuxSplit = (paneId: string, windowId: string, shellCmd: string): boolean => {
	const splitFlag = tmuxWindowHasMultiplePanes(windowId) ? "-v" : "-h";
	const result = spawnSync("tmux", ["split-window", splitFlag, "-t", paneId, shellCmd], {
		encoding: "utf8",
	});
	return result.status === 0;
};

const editPathInTmux = (ctx: ExtensionContext, target: FileEntry): void => {
	const tmux = getTmuxInfo();
	if (!tmux) {
		ctx.ui.notify("Not running inside tmux — cannot open nvim split", "error");
		return;
	}
	const success = openInTmuxSplit(tmux.paneId, tmux.windowId, `nvim ${shellEscape(target.resolvedPath)}`);
	if (!success) {
		ctx.ui.notify("Failed to open nvim pane", "error");
	}
};

// ─────────────────────────────────────────────────────────────────────────────

const openPath = async (pi: ExtensionAPI, ctx: ExtensionContext, target: FileEntry): Promise<void> => {
	if (!existsSync(target.resolvedPath)) {
		ctx.ui.notify(`File not found: ${target.displayPath}`, "error");
		return;
	}

	const command = process.platform === "darwin" ? "open" : "xdg-open";
	const result = await pi.exec(command, [target.resolvedPath]);
	if (result.code !== 0) {
		const errorMessage = result.stderr?.trim() || `Failed to open ${target.displayPath}`;
		ctx.ui.notify(errorMessage, "error");
	}
};

const openExternalEditor = (tui: TUI, editorCmd: string, content: string): string | null => {
	const tmpFile = path.join(os.tmpdir(), `pi-files-edit-${Date.now()}.txt`);

	try {
		writeFileSync(tmpFile, content, "utf8");
		tui.stop();

		const [editor, ...editorArgs] = editorCmd.split(" ");
		const result = spawnSync(editor, [...editorArgs, tmpFile], { stdio: "inherit" });

		if (result.status === 0) {
			return readFileSync(tmpFile, "utf8").replace(/\n$/, "");
		}

		return null;
	} finally {
		try {
			unlinkSync(tmpFile);
		} catch {
		}
		tui.start();
		tui.requestRender(true);
	}
};

const editPath = async (ctx: ExtensionContext, target: FileEntry, content: string): Promise<void> => {
	const editorCmd = process.env.VISUAL || process.env.EDITOR;
	if (!editorCmd) {
		ctx.ui.notify("No editor configured. Set $VISUAL or $EDITOR.", "warning");
		return;
	}

	const updated = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const status = new Text(theme.fg("dim", `Opening ${editorCmd}...`));

		queueMicrotask(() => {
			const result = openExternalEditor(tui, editorCmd, content);
			done(result);
		});

		return status;
	});

	if (updated === null) {
		ctx.ui.notify("Edit cancelled", "info");
		return;
	}

	try {
		writeFileSync(target.resolvedPath, updated, "utf8");
	} catch {
		ctx.ui.notify(`Failed to save ${target.displayPath}`, "error");
	}
};

const revealPath = async (pi: ExtensionAPI, ctx: ExtensionContext, target: FileEntry): Promise<void> => {
	if (!existsSync(target.resolvedPath)) {
		ctx.ui.notify(`File not found: ${target.displayPath}`, "error");
		return;
	}

	const isDirectory = target.isDirectory || statSync(target.resolvedPath).isDirectory();
	let command = "open";
	let args: string[] = [];

	if (process.platform === "darwin") {
		args = isDirectory ? [target.resolvedPath] : ["-R", target.resolvedPath];
	} else {
		command = "xdg-open";
		args = [isDirectory ? target.resolvedPath : path.dirname(target.resolvedPath)];
	}

	const result = await pi.exec(command, args);
	if (result.code !== 0) {
		const errorMessage = result.stderr?.trim() || `Failed to reveal ${target.displayPath}`;
		ctx.ui.notify(errorMessage, "error");
	}
};

const quickLookPath = async (pi: ExtensionAPI, ctx: ExtensionContext, target: FileEntry): Promise<void> => {
	if (process.platform !== "darwin") {
		ctx.ui.notify("Quick Look is only available on macOS", "warning");
		return;
	}

	if (!existsSync(target.resolvedPath)) {
		ctx.ui.notify(`File not found: ${target.displayPath}`, "error");
		return;
	}

	const isDirectory = target.isDirectory || statSync(target.resolvedPath).isDirectory();
	if (isDirectory) {
		ctx.ui.notify("Quick Look only works on files", "warning");
		return;
	}

	const result = await pi.exec("qlmanage", ["-p", target.resolvedPath]);
	if (result.code !== 0) {
		const errorMessage = result.stderr?.trim() || `Failed to Quick Look ${target.displayPath}`;
		ctx.ui.notify(errorMessage, "error");
	}
};

const showFileSelector = async (
	ctx: ExtensionContext,
	files: FileEntry[],
	selectedPath?: string | null,
): Promise<FileEntry | null> => {
	const items: SelectItem[] = files.map((file) => {
		const directoryLabel = file.isDirectory ? " [directory]" : "";
		const changeLabel = file.hasSessionChange ? " [modified]" : "";
		return {
			value: file.canonicalPath,
			label: `${file.displayPath}${directoryLabel}${changeLabel}`,
		};
	});

	const selection = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
		container.addChild(new Text(theme.fg("accent", theme.bold(" Select file")), 0, 0));

		const searchInput = new Input();
		container.addChild(searchInput);
		container.addChild(new Spacer(1));

		const listContainer = new Container();
		container.addChild(listContainer);
		container.addChild(
			new Text(theme.fg("dim", "Type to filter • enter to select • esc to cancel"), 0, 0),
		);
		container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));

		let filteredItems = items;
		let selectList: SelectList | null = null;

		const updateList = () => {
			listContainer.clear();
			if (filteredItems.length === 0) {
				listContainer.addChild(new Text(theme.fg("warning", "  No matching files"), 0, 0));
				selectList = null;
				return;
			}

			selectList = new SelectList(filteredItems, Math.min(filteredItems.length, 12), {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			});

			if (selectedPath) {
				const index = filteredItems.findIndex((item) => item.value === selectedPath);
				if (index >= 0) {
					selectList.setSelectedIndex(index);
				}
			}

			selectList.onSelect = (item) => done(item.value as string);
			selectList.onCancel = () => done(null);

			listContainer.addChild(selectList);
		};

		const applyFilter = () => {
			const query = searchInput.getValue();
			filteredItems = query
				? fuzzyFilter(items, query, (item) => `${item.label} ${item.value} ${item.description ?? ""}`)
				: items;
			updateList();
		};

		applyFilter();

		return {
			render(width: number) {
				return container.render(width);
			},
			invalidate() {
				container.invalidate();
			},
			handleInput(data: string) {
				const kb = getKeybindings();
				if (
					kb.matches(data, "tui.select.up") ||
					kb.matches(data, "tui.select.down") ||
					kb.matches(data, "tui.select.confirm") ||
					kb.matches(data, "tui.select.cancel")
				) {
					if (selectList) {
						selectList.handleInput(data);
					} else if (kb.matches(data, "tui.select.cancel")) {
						done(null);
					}
					tui.requestRender();
					return;
				}

				searchInput.handleInput(data);
				applyFilter();
				tui.requestRender();
			},
		};
	});

	return selection ? files.find((file) => file.canonicalPath === selection) ?? null : null;
};

const runFileBrowser = async (pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> => {
	if (!ctx.hasUI) {
		ctx.ui.notify("Files requires interactive mode", "error");
		return;
	}

	const files = buildFileEntries(ctx);
	if (files.length === 0) {
		ctx.ui.notify("No files referenced in session", "info");
		return;
	}

	let lastSelectedPath: string | null = null;
	while (true) {
		const selected = await showFileSelector(ctx, files, lastSelectedPath);
		if (!selected) {
			ctx.ui.notify("Files cancelled", "info");
			return;
		}

		lastSelectedPath = selected.canonicalPath;

		const editCheck = getEditableContent(selected);
		if (!editCheck.allowed) {
			ctx.ui.notify(editCheck.reason ?? "File cannot be edited", "warning");
			continue;
		}

		editPathInTmux(ctx, selected);
		return;
	}
};

export default function (pi: ExtensionAPI): void {
	pi.registerCommand("files", {
		description: "Browse files referenced in the session",
		handler: async (_args, ctx) => {
			await runFileBrowser(pi, ctx);
		},
	});

	pi.registerShortcut("ctrl+shift+o", {
		description: "Browse files mentioned in the session",
		handler: async (ctx) => {
			await runFileBrowser(pi, ctx);
		},
	});

	pi.registerShortcut("ctrl+shift+f", {
		description: "Reveal the latest file reference in Finder",
		handler: async (ctx) => {
			const entries = ctx.sessionManager.getBranch();
			const latest = findLatestFileReference(entries, ctx.cwd);

			if (!latest) {
				ctx.ui.notify("No file reference found in the session", "warning");
				return;
			}

			const canonical = toCanonicalPath(latest.path);
			if (!canonical) {
				ctx.ui.notify(`File not found: ${latest.display}`, "error");
				return;
			}

			await revealPath(pi, ctx, {
				canonicalPath: canonical.canonicalPath,
				resolvedPath: canonical.canonicalPath,
				displayPath: latest.display,
				exists: true,
				isDirectory: canonical.isDirectory,
				isReferenced: true,
				hasSessionChange: false,
				lastTimestamp: 0,
			});
		},
	});

	pi.registerShortcut("ctrl+shift+r", {
		description: "Quick Look the latest file reference",
		handler: async (ctx) => {
			const entries = ctx.sessionManager.getBranch();
			const latest = findLatestFileReference(entries, ctx.cwd);

			if (!latest) {
				ctx.ui.notify("No file reference found in the session", "warning");
				return;
			}

			const canonical = toCanonicalPath(latest.path);
			if (!canonical) {
				ctx.ui.notify(`File not found: ${latest.display}`, "error");
				return;
			}

			await quickLookPath(pi, ctx, {
				canonicalPath: canonical.canonicalPath,
				resolvedPath: canonical.canonicalPath,
				displayPath: latest.display,
				exists: true,
				isDirectory: canonical.isDirectory,
				isReferenced: true,
				hasSessionChange: false,
				lastTimestamp: 0,
			});
		},
	});
}
