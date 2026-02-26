/**
 * Destructive Tool Guard Extension
 *
 * Detects destructive tool uses across bash, write, and edit tools,
 * prompts the user for permission before executing them, and supports
 * a whitelist system so permitted patterns don't prompt again.
 *
 * Resilient to model bypass attempts including:
 * - Command obfuscation (base64, hex, octal, ANSI-C quoting)
 * - Variable substitution tricks
 * - Command chaining (&&, ||, ;, pipes)
 * - Indirect execution (eval, bash -c, sh -c, xargs, find -exec, python -c, etc.)
 * - Heredocs and redirect overwrites
 * - Script creation + execution via write tool
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

// --- Types & Constants ---

interface WhitelistRule {
	id: string;
	pattern: string; // regex string
	toolTypes: string[]; // ["bash", "write", "edit", "*"]
	scope: "session";
	description: string;
	createdAt: number;
}

interface DetectionResult {
	detected: boolean;
	reason: string;
}

const MAX_RECURSION_DEPTH = 3;
const GLOBAL_WHITELIST_PATH = path.join(
	process.env.HOME || "~",
	".pi",
	"agent",
	"destructive-guard-whitelist.json",
);

// --- Normalization & Deobfuscation ---

function flattenContinuations(cmd: string): string {
	return cmd.replace(/\\\n/g, "").replace(/\n/g, " ; ");
}

function decodeHexEscapes(s: string): string {
	// \xNN hex escapes
	let result = s.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
		String.fromCharCode(parseInt(hex, 16)),
	);
	// Octal escapes \NNN
	result = result.replace(/\\([0-7]{3})/g, (_, oct) =>
		String.fromCharCode(parseInt(oct, 8)),
	);
	return result;
}

function decodeAnsiCQuoting(s: string): string {
	// $'\xNN' or $'\NNN' ANSI-C quoting
	return s.replace(/\$'([^']+)'/g, (_, inner) => decodeHexEscapes(inner));
}

function decodeBase64Payloads(cmd: string): string[] {
	const payloads: string[] = [];

	// echo <base64> | base64 -d or base64 -d <<< <string> or base64 --decode
	const patterns = [
		/echo\s+["']?([A-Za-z0-9+/=]{4,})["']?\s*\|\s*base64\s+(?:-d|--decode)/g,
		/base64\s+(?:-d|--decode)\s*<<<\s*["']?([A-Za-z0-9+/=]{4,})["']?/g,
		/printf\s+["']?([A-Za-z0-9+/=]{4,})["']?\s*\|\s*base64\s+(?:-d|--decode)/g,
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(cmd)) !== null) {
			try {
				const decoded = Buffer.from(match[1], "base64").toString("utf-8");
				if (decoded && /[\x20-\x7e]/.test(decoded)) {
					payloads.push(decoded);
				}
			} catch {
				// Invalid base64, skip
			}
		}
	}

	return payloads;
}

function resolveVariableSubstitutions(cmd: string): string {
	// Match: VAR=value or VAR="value" at the start or after ; && ||
	const assignments = new Map<string, string>();
	const assignPattern = /(?:^|[;&|]\s*)([A-Za-z_][A-Za-z0-9_]*)=["']?([^"';&\n]+)["']?/g;
	let match;
	while ((match = assignPattern.exec(cmd)) !== null) {
		assignments.set(match[1], match[2].trim());
	}

	if (assignments.size === 0) return cmd;

	let resolved = cmd;
	for (const [varName, value] of assignments) {
		// Replace $VAR, ${VAR}, "$VAR", "${VAR}"
		const varPatterns = [
			new RegExp(`\\$\\{${varName}\\}`, "g"),
			new RegExp(`\\$${varName}\\b`, "g"),
		];
		for (const vp of varPatterns) {
			resolved = resolved.replace(vp, value);
		}
	}

	return resolved;
}

function normalizeCommand(cmd: string): string[] {
	const views: string[] = [];
	views.push(cmd); // raw
	views.push(cmd.toLowerCase().replace(/\s+/g, " ").trim()); // lowered
	views.push(cmd.replace(/['"\\]/g, "")); // unquoted

	const flattened = flattenContinuations(cmd);
	views.push(flattened);

	const unescaped = decodeHexEscapes(decodeAnsiCQuoting(flattened));
	views.push(unescaped);

	const varResolved = resolveVariableSubstitutions(flattened);
	views.push(varResolved);

	const varResolvedUnescaped = decodeHexEscapes(decodeAnsiCQuoting(varResolved));
	views.push(varResolvedUnescaped);

	return [...new Set(views)]; // deduplicate
}

// --- Command Splitting ---

function splitChainedCommands(cmd: string): string[] {
	const commands: string[] = [];
	let current = "";
	let singleQuote = false;
	let doubleQuote = false;
	let backtick = false;
	let parenDepth = 0;
	let braceDepth = 0;

	for (let i = 0; i < cmd.length; i++) {
		const c = cmd[i];
		const prev = i > 0 ? cmd[i - 1] : "";

		if (prev === "\\") {
			current += c;
			continue;
		}

		if (c === "'" && !doubleQuote && !backtick) {
			singleQuote = !singleQuote;
			current += c;
			continue;
		}
		if (c === '"' && !singleQuote && !backtick) {
			doubleQuote = !doubleQuote;
			current += c;
			continue;
		}
		if (c === "`" && !singleQuote && !doubleQuote) {
			backtick = !backtick;
			current += c;
			continue;
		}

		if (!singleQuote && !doubleQuote && !backtick) {
			if (c === "(") parenDepth++;
			if (c === ")") parenDepth = Math.max(0, parenDepth - 1);
			if (c === "{") braceDepth++;
			if (c === "}") braceDepth = Math.max(0, braceDepth - 1);

			if (parenDepth === 0 && braceDepth === 0) {
				// Split on ; && || |
				if (c === ";") {
					if (current.trim()) commands.push(current.trim());
					current = "";
					continue;
				}
				if (c === "&" && cmd[i + 1] === "&") {
					if (current.trim()) commands.push(current.trim());
					current = "";
					i++; // skip second &
					continue;
				}
				if (c === "|" && cmd[i + 1] === "|") {
					if (current.trim()) commands.push(current.trim());
					current = "";
					i++; // skip second |
					continue;
				}
				if (c === "|" && cmd[i + 1] !== "|") {
					if (current.trim()) commands.push(current.trim());
					current = "";
					continue;
				}
			}
		}

		current += c;
	}

	if (current.trim()) commands.push(current.trim());
	return commands;
}

// --- Indirect Execution Extraction ---

function extractIndirectPayloads(cmd: string): string[] {
	const payloads: string[] = [];

	// bash -c / sh -c / zsh -c "..."
	const shellC = /\b(?:ba)?sh\s+-c\s+["'](.+?)["']/gi;
	let m;
	while ((m = shellC.exec(cmd)) !== null) {
		payloads.push(m[1]);
	}

	// zsh -c
	const zshC = /\bzsh\s+-c\s+["'](.+?)["']/gi;
	while ((m = zshC.exec(cmd)) !== null) {
		payloads.push(m[1]);
	}

	// eval "..." or eval '...'
	const evalPattern = /\beval\s+["'](.+?)["']/gi;
	while ((m = evalPattern.exec(cmd)) !== null) {
		payloads.push(m[1]);
	}

	// eval $VAR (without quotes - the var was already resolved)
	const evalVar = /\beval\s+\$\{?([A-Za-z_]\w*)\}?/gi;
	while ((m = evalVar.exec(cmd)) !== null) {
		// The variable should have been resolved already in normalization
		// Flag the eval itself as suspicious
		payloads.push(`eval_var_${m[1]}`);
	}

	// python -c / python3 -c / python -m / ruby -e / perl -e / node -e
	// Use multiple patterns to handle different quoting styles
	const scriptPatterns = [
		/\b(?:python3?|ruby|perl|node)\s+(?:-c|-e|-m)\s+["'](.+?)["']/gi,
		/\b(?:python3?|ruby|perl|node)\s+(?:-c|-e|-m)\s+(.+?)(?:\s*[;&|]|$)/gi,
	];
	for (const scriptExec of scriptPatterns) {
		while ((m = scriptExec.exec(cmd)) !== null) {
			const body = m[1];

			// The body itself is a payload — scan it directly for destructive patterns
			// This catches Python-native ops like shutil.rmtree, os.remove, etc.
			payloads.push(body);

			// Also extract shell commands embedded in the script body
			const shellCalls = [
				/os\.system\(["'](.+?)["']\)/g,
				/subprocess\.(?:call|run|Popen)\(\[?["'](.+?)["']/g,
				/system\(["'](.+?)["']\)/g, // Ruby/Perl
				/exec\(["'](.+?)["']\)/g,
				/`(.+?)`/g, // backtick execution in Ruby/Perl
			];
			for (const sp of shellCalls) {
				let sm;
				while ((sm = sp.exec(body)) !== null) {
					payloads.push(sm[1]);
				}
			}
		}
	}

	// xargs command
	const xargsPattern = /\bxargs\s+(?:-[^\s]*\s+)*(.+)/gi;
	while ((m = xargsPattern.exec(cmd)) !== null) {
		payloads.push(m[1].trim());
	}

	// find ... -exec command {} \;
	const findExec = /\bfind\s+.+?-exec\s+(.+?)\s+(?:\\;|\+)/gi;
	while ((m = findExec.exec(cmd)) !== null) {
		payloads.push(m[1].replace(/\{\}/g, "TARGET").trim());
	}

	// find ... -delete
	if (/\bfind\s+.+?-delete\b/i.test(cmd)) {
		payloads.push("find -delete");
	}

	// Strip prefixes: sudo, doas, env X=Y, nohup, nice, time, strace
	const prefixPattern =
		/^(?:sudo|doas|nohup|nice|time|strace|command|builtin)\s+(.+)/i;
	const prefixMatch = cmd.match(prefixPattern);
	if (prefixMatch) {
		payloads.push(prefixMatch[1].trim());
	}

	// env VAR=VAL command
	const envPrefix = /^env\s+(?:\w+=\S+\s+)+(.+)/i;
	const envMatch = cmd.match(envPrefix);
	if (envMatch) {
		payloads.push(envMatch[1].trim());
	}

	// Heredoc: cat <<EOF > /path or tee /path <<EOF
	const heredocWrite =
		/(?:cat|tee)\s+(?:<<\w+\s*>|>\s*)([^\s;&|]+)/gi;
	while ((m = heredocWrite.exec(cmd)) !== null) {
		payloads.push(`redirect_to:${m[1]}`);
	}

	return payloads;
}

// --- Destructive Pattern Detectors ---

const bashDestructivePatterns: Array<{ pattern: RegExp; label: string }> = [
	// File deletion
	{ pattern: /\brm\s+(-[a-zA-Z]*[rfR]|--(?:recursive|force))/i, label: "rm with -rf/--recursive/--force" },
	{ pattern: /\brm\s+(?!-)[^\s|;&]*/i, label: "rm (file deletion)" },
	{ pattern: /\brmdir\b/i, label: "rmdir" },
	{ pattern: /\bunlink\b/i, label: "unlink" },

	// Disk operations
	{ pattern: /\bdd\b.*\bof=/i, label: "dd with output file" },
	{ pattern: /\b(?:mkfs|fdisk|parted|wipefs|sgdisk)\b/i, label: "disk format/partition tool" },

	// Git destructive
	{ pattern: /\bgit\s+push\s+(?:-[a-z]*f|--force)/i, label: "git force push" },
	{ pattern: /\bgit\s+reset\s+--hard/i, label: "git reset --hard" },
	{ pattern: /\bgit\s+clean\s+(?:-[a-z]*f|--force)/i, label: "git clean --force" },

	// Database destructive
	{ pattern: /\bDROP\s+(?:TABLE|DATABASE|SCHEMA|INDEX)\b/i, label: "SQL DROP" },
	{ pattern: /\bDELETE\s+FROM\b/i, label: "SQL DELETE FROM" },
	{ pattern: /\bTRUNCATE\s+TABLE\b/i, label: "SQL TRUNCATE TABLE" },

	// Permission changes
	{ pattern: /\bchmod\s+(?:777|a\+rwx|[-=]rwxrwxrwx)/i, label: "chmod 777/a+rwx" },
	{ pattern: /\bchmod\s+(?:000|a-rwx)/i, label: "chmod 000 (remove all perms)" },

	// File destruction
	{ pattern: /\b(?:truncate|shred|wipe)\b/i, label: "file truncate/shred/wipe" },

	// Device writes
	{ pattern: />\s*\/dev\/sd[a-z]/i, label: "write to raw device" },
	{ pattern: /\bmv\b.*\/dev\/null/i, label: "mv to /dev/null" },

	// Pipe-to-shell (remote code execution)
	{ pattern: /\bcurl\b.*\|\s*(?:ba)?sh\b/i, label: "curl pipe to shell" },
	{ pattern: /\bwget\b.*\|\s*(?:ba)?sh\b/i, label: "wget pipe to shell" },

	// Service management
	{ pattern: /\b(?:systemctl|service)\s+(?:stop|disable|mask)\b/i, label: "service stop/disable" },

	// Process killing
	{ pattern: /\bkillall\b/i, label: "killall" },
	{ pattern: /\bpkill\s+-9\b/i, label: "pkill -9" },
	{ pattern: /\bkill\s+-9\b/i, label: "kill -9" },

	// Network/firewall
	{ pattern: /\biptables\s+-F\b/i, label: "iptables flush" },

	// Redirect overwrite to sensitive locations
	{ pattern: />\s*\/etc\//i, label: "redirect write to /etc/" },
	{ pattern: />\s*~\/\.(bash|zsh|profile|ssh)/i, label: "redirect write to dotfile" },

	// find -delete
	{ pattern: /\bfind\b.*-delete\b/i, label: "find -delete" },

	// --- Language-native destructive operations ---

	// Python destructive
	{ pattern: /\bshutil\.rmtree\b/i, label: "Python shutil.rmtree (recursive delete)" },
	{ pattern: /\bshutil\.move\b/i, label: "Python shutil.move" },
	{ pattern: /\bos\.(?:remove|unlink|rmdir|removedirs)\b/i, label: "Python os file deletion" },
	{ pattern: /\bos\.rename\b/i, label: "Python os.rename" },
	{ pattern: /\bpathlib\.Path\b[^)]*\.(?:unlink|rmdir)\b/i, label: "Python pathlib deletion" },
	{ pattern: /\.unlink\(\s*(?:missing_ok\s*=\s*True)?\s*\)/i, label: "Python .unlink() (file deletion)" },
	{ pattern: /\bsend2trash\b/i, label: "Python send2trash" },

	// Ruby destructive
	{ pattern: /\bFileUtils\.rm_rf?\b/i, label: "Ruby FileUtils.rm/rm_r/rm_rf" },
	{ pattern: /\bFileUtils\.remove_dir\b/i, label: "Ruby FileUtils.remove_dir" },
	{ pattern: /\bFile\.delete\b/i, label: "Ruby File.delete" },
	{ pattern: /\bDir\.rmdir\b/i, label: "Ruby Dir.rmdir" },

	// Node.js destructive
	{ pattern: /\bfs\.(?:rm|rmdir|unlink|rmSync|rmdirSync|unlinkSync)\b/i, label: "Node.js fs file deletion" },
	{ pattern: /\bfs\.(?:writeFile|writeFileSync)\b.*['"]\s*['"]/i, label: "Node.js fs write empty file" },
	{ pattern: /\brimraf\b/i, label: "Node.js rimraf (recursive delete)" },

	// Perl destructive
	{ pattern: /\bFile::Path.*\brmtree\b/i, label: "Perl File::Path rmtree" },
];

// Obfuscation markers that suggest bypass attempts if we can't fully resolve
const obfuscationMarkers = [
	/\bbase64\s+(?:-d|--decode)\b/i,
	/\$\(.*\)/,
	/\beval\b/i,
	/\bprintf\s+['"]\\x/i,
	/\$'\\x/,
	/xxd\s+-r/i,
];

function testPatterns(input: string): DetectionResult | null {
	for (const { pattern, label } of bashDestructivePatterns) {
		if (pattern.test(input)) {
			return { detected: true, reason: label };
		}
	}
	return null;
}

function isBashDestructive(cmd: string, depth: number = 0): DetectionResult {
	if (depth > MAX_RECURSION_DEPTH) {
		return { detected: false, reason: "" };
	}

	// Step 1: Generate normalized views
	const flattened = flattenContinuations(cmd);
	const views = normalizeCommand(flattened);

	// Step 2: Decode base64 payloads and add to views
	const base64Payloads = decodeBase64Payloads(flattened);
	for (const payload of base64Payloads) {
		views.push(payload);
		views.push(...normalizeCommand(payload));
	}

	// Step 3: Split on chains and test each sub-command
	const allSubCommands: string[] = [];
	for (const view of views) {
		allSubCommands.push(...splitChainedCommands(view));
	}

	// Deduplicate
	const uniqueSubCommands = [...new Set(allSubCommands)];

	for (const subCmd of uniqueSubCommands) {
		// Test direct patterns
		const directMatch = testPatterns(subCmd);
		if (directMatch) return directMatch;

		// Test normalized forms
		for (const nv of normalizeCommand(subCmd)) {
			const normalMatch = testPatterns(nv);
			if (normalMatch) return normalMatch;
		}

		// Extract indirect payloads and recurse
		const payloads = extractIndirectPayloads(subCmd);
		for (const payload of payloads) {
			// Handle special redirect_to: markers
			if (payload.startsWith("redirect_to:")) {
				const target = payload.slice("redirect_to:".length);
				if (isSensitivePath(target)) {
					return {
						detected: true,
						reason: `heredoc/redirect overwrite to sensitive path: ${target}`,
					};
				}
				continue;
			}

			const subResult = isBashDestructive(payload, depth + 1);
			if (subResult.detected) return subResult;
		}
	}

	// Step 4: Catch-all heuristic — flag unresolvable obfuscation
	const hasObfuscation = obfuscationMarkers.some((m) => m.test(flattened));
	if (hasObfuscation) {
		// Check if the obfuscation was already resolved (we found a real command above)
		// If base64 was decoded or eval was extracted, we already tested those
		// Only flag if the command also has suspicious tokens near the obfuscation
		const suspiciousContext =
			/\|\s*(?:ba)?sh\b/i.test(flattened) ||
			/\beval\b/i.test(flattened) ||
			/\bexec\b/i.test(flattened) ||
			/\bsource\b/i.test(flattened) ||
			/\b\.\s+\//i.test(flattened);

		if (suspiciousContext) {
			return {
				detected: true,
				reason: "contains obfuscation with execution context (possible bypass attempt)",
			};
		}
	}

	return { detected: false, reason: "" };
}

// --- Sensitive Path Detection ---

const sensitivePathPatterns = [
	/^\/etc\//,
	/^\/usr\/local\/bin\//,
	/^\/usr\/bin\//,
	/^\/?\.env(\..*)?$/,
	/\/\.env(\..*)?$/,
	/^\/?\.ssh\//,
	/\/\.ssh\//,
	/^\/?\.gnupg\//,
	/\/\.gnupg\//,
	/\/\.git\/(?!ignore)/,
	/^\/?\.git\/(?!ignore)/,
	/^\/?\.bashrc$/,
	/^\/?\.zshrc$/,
	/^\/?\.profile$/,
	/^\/?\.bash_profile$/,
	/^\/?\.gitconfig$/,
	/\/id_rsa/,
	/\/id_ed25519/,
	/\/authorized_keys/,
	/\/known_hosts$/,
	/\/\.aws\/credentials/,
	/\/\.kube\/config/,
	/\/\.docker\/config\.json/,
];

function isSensitivePath(filePath: string): boolean {
	const normalized = filePath.replace(/^~/, process.env.HOME || "");
	return sensitivePathPatterns.some((p) => p.test(normalized) || p.test(filePath));
}

// --- Write & Edit Detection ---

function isWriteDestructive(
	filePath: string,
	content: string,
): DetectionResult {
	// Check sensitive path
	if (isSensitivePath(filePath)) {
		return {
			detected: true,
			reason: `write to sensitive path: ${filePath}`,
		};
	}

	// Check empty content (file truncation/wipe)
	if (content.trim() === "") {
		return {
			detected: true,
			reason: `write empty content to file (truncation): ${filePath}`,
		};
	}

	// Check if writing a shell script with destructive content
	const isScript =
		filePath.endsWith(".sh") ||
		filePath.endsWith(".bash") ||
		content.startsWith("#!/");
	if (isScript) {
		const scriptCheck = isBashDestructive(content);
		if (scriptCheck.detected) {
			return {
				detected: true,
				reason: `writing script with destructive content to ${filePath}: ${scriptCheck.reason}`,
			};
		}
	}

	return { detected: false, reason: "" };
}

function isEditDestructive(
	filePath: string,
	oldText: string,
	newText: string,
): DetectionResult {
	// Check sensitive path
	if (isSensitivePath(filePath)) {
		return {
			detected: true,
			reason: `edit to sensitive path: ${filePath}`,
		};
	}

	// Check bulk deletion (replacing large content with empty/tiny)
	if (newText.trim() === "" && oldText.length > 100) {
		return {
			detected: true,
			reason: `bulk content deletion in ${filePath} (${oldText.length} chars → empty)`,
		};
	}

	return { detected: false, reason: "" };
}

// --- Generic Tool Detection ---

function isGenericToolDestructive(
	toolName: string,
	input: Record<string, unknown>,
): DetectionResult {
	// Scan all string values for destructive bash patterns
	const strings = extractStrings(input);
	for (const s of strings) {
		if (s.length > 10 && s.length < 10000) {
			// Only check reasonably-sized strings
			const check = isBashDestructive(s);
			if (check.detected) {
				return {
					detected: true,
					reason: `tool "${toolName}" parameter contains destructive content: ${check.reason}`,
				};
			}
		}
	}
	return { detected: false, reason: "" };
}

function extractStrings(obj: unknown, depth: number = 0): string[] {
	if (depth > 5) return [];
	if (typeof obj === "string") return [obj];
	if (Array.isArray(obj)) {
		return obj.flatMap((item) => extractStrings(item, depth + 1));
	}
	if (obj && typeof obj === "object") {
		return Object.values(obj).flatMap((val) => extractStrings(val, depth + 1));
	}
	return [];
}

// --- Whitelist Engine ---

class WhitelistEngine {
	private sessionRules: WhitelistRule[] = [];
	private globalRules: WhitelistRule[] = [];

	constructor() {
		this.loadGlobalRules();
	}

	addRule(rule: WhitelistRule): void {
		if (rule.scope === "session") {
			this.sessionRules.push(rule);
		} else {
			this.globalRules.push(rule);
			this.saveGlobalRules();
		}
	}

	addGlobalRule(rule: WhitelistRule): void {
		this.globalRules.push(rule);
		this.saveGlobalRules();
	}

	removeRule(id: string): void {
		this.sessionRules = this.sessionRules.filter((r) => r.id !== id);
		const before = this.globalRules.length;
		this.globalRules = this.globalRules.filter((r) => r.id !== id);
		if (this.globalRules.length !== before) {
			this.saveGlobalRules();
		}
	}

	isWhitelisted(
		toolName: string,
		commandOrPath: string,
	): WhitelistRule | null {
		const allRules = [...this.sessionRules, ...this.globalRules];
		for (const rule of allRules) {
			// Check tool type
			if (!rule.toolTypes.includes("*") && !rule.toolTypes.includes(toolName)) {
				continue;
			}
			// Check pattern
			try {
				const regex = new RegExp(rule.pattern, "i");
				if (regex.test(commandOrPath)) {
					return rule;
				}
			} catch {
				// Invalid regex, skip
			}
		}
		return null;
	}

	getSessionRules(): WhitelistRule[] {
		return [...this.sessionRules];
	}

	getGlobalRules(): WhitelistRule[] {
		return [...this.globalRules];
	}

	getAllRules(): WhitelistRule[] {
		return [...this.sessionRules, ...this.globalRules];
	}

	clearSession(): void {
		this.sessionRules = [];
	}

	clearGlobal(): void {
		this.globalRules = [];
		this.saveGlobalRules();
	}

	restoreSessionRules(rules: WhitelistRule[]): void {
		this.sessionRules = rules;
	}

	private loadGlobalRules(): void {
		try {
			if (fs.existsSync(GLOBAL_WHITELIST_PATH)) {
				const data = JSON.parse(fs.readFileSync(GLOBAL_WHITELIST_PATH, "utf-8"));
				if (data.version === 1 && Array.isArray(data.rules)) {
					this.globalRules = data.rules;
				}
			}
		} catch {
			// Corrupted file, start fresh
			this.globalRules = [];
		}
	}

	private saveGlobalRules(): void {
		try {
			const dir = path.dirname(GLOBAL_WHITELIST_PATH);
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(
				GLOBAL_WHITELIST_PATH,
				JSON.stringify(
					{ version: 1, rules: this.globalRules },
					null,
					2,
				),
			);
		} catch {
			// Best effort
		}
	}
}

// --- Utility ---

function generateId(): string {
	return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function suggestPattern(toolName: string, input: string): string {
	// Escape special regex chars and suggest a pattern based on the command
	if (toolName === "bash") {
		// Extract the first "word" (command name) for a concise pattern
		const firstWord = input.trim().split(/\s+/)[0];
		if (firstWord) {
			const escaped = firstWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			// If the command has a specific path, include it
			const pathMatch = input.match(/\s(\/\S+)/);
			if (pathMatch) {
				const escapedPath = pathMatch[1].replace(
					/[.*+?^${}()|[\]\\]/g,
					"\\$&",
				);
				return `${escaped}.*${escapedPath}`;
			}
			return `\\b${escaped}\\b`;
		}
	} else if (toolName === "write" || toolName === "edit") {
		// Suggest pattern based on the path
		const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return escaped;
	}
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 60);
}

function truncateDisplay(s: string, max: number = 200): string {
	if (s.length <= max) return s;
	return s.slice(0, max) + "…";
}

// --- Main Extension ---

export default function (pi: ExtensionAPI) {
	const engine = new WhitelistEngine();

	// Persist session whitelist
	function persistSessionWhitelist(): void {
		pi.appendEntry("destructive-guard-whitelist", {
			rules: engine.getSessionRules(),
		});
	}

	// Restore session whitelist on start
	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		// Find the last whitelist entry
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (
				entry.type === "custom" &&
				entry.customType === "destructive-guard-whitelist" &&
				entry.data?.rules
			) {
				engine.restoreSessionRules(entry.data.rules as WhitelistRule[]);
				break;
			}
		}
	});

	// Also restore on session switch/fork/tree navigation
	const restoreFromSession = async (_event: unknown, ctx: ExtensionContext) => {
		engine.clearSession();
		const entries = ctx.sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (
				entry.type === "custom" &&
				entry.customType === "destructive-guard-whitelist" &&
				entry.data?.rules
			) {
				engine.restoreSessionRules(entry.data.rules as WhitelistRule[]);
				break;
			}
		}
	};

	pi.on("session_switch", restoreFromSession);
	pi.on("session_fork", restoreFromSession);
	pi.on("session_tree", restoreFromSession);

	// --- Main tool_call handler ---
	pi.on("tool_call", async (event, ctx) => {
		let detection: DetectionResult = { detected: false, reason: "" };
		let commandOrPath = "";

		if (isToolCallEventType("bash", event)) {
			const command = event.input.command;
			commandOrPath = command;
			detection = isBashDestructive(command);
		} else if (isToolCallEventType("write", event)) {
			const filePath = event.input.path;
			const content = event.input.content;
			commandOrPath = filePath;
			detection = isWriteDestructive(filePath, content);
		} else if (isToolCallEventType("edit", event)) {
			const filePath = event.input.path;
			const oldText = event.input.oldText;
			const newText = event.input.newText;
			commandOrPath = filePath;
			detection = isEditDestructive(filePath, oldText, newText);
		} else if (
			event.toolName !== "read" &&
			event.toolName !== "ls" &&
			event.toolName !== "find" &&
			event.toolName !== "web_search" &&
			event.toolName !== "fetch_page" &&
			event.toolName !== "extract_content" &&
			event.toolName !== "questionnaire" &&
			event.toolName !== "subagent"
		) {
			// Unknown/custom tool — generic scan
			commandOrPath = JSON.stringify(event.input);
			detection = isGenericToolDestructive(
				event.toolName,
				event.input as Record<string, unknown>,
			);
		}

		if (!detection.detected) return undefined;

		// Check whitelist
		const whitelistMatch = engine.isWhitelisted(
			event.toolName,
			commandOrPath,
		);
		if (whitelistMatch) return undefined;

		// No UI — block by default
		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `Destructive operation blocked (no UI): ${detection.reason}`,
			};
		}

		// Show permission dialog
		const displayCmd = truncateDisplay(commandOrPath, 300);
		const choice = await ctx.ui.select(
			`⚠️  Destructive operation detected!\n\n` +
				`Tool: ${event.toolName}\n` +
				`${event.toolName === "bash" ? "Command" : "Path"}: ${displayCmd}\n` +
				`Reason: ${detection.reason}\n`,
			[
				"Allow once",
				"Allow & whitelist for this session",
				"Allow & whitelist permanently",
				"Block",
			],
			{ timeout: 60000 },
		);

		if (choice === "Allow once") {
			return undefined;
		}

		if (
			choice === "Allow & whitelist for this session" ||
			choice === "Allow & whitelist permanently"
		) {
			const suggested = suggestPattern(event.toolName, commandOrPath);
			const pattern = await ctx.ui.input(
				"Whitelist pattern (regex):",
				suggested,
			);

			if (pattern === undefined) {
				// User cancelled pattern input — still allow this once
				return undefined;
			}

			// Validate regex
			try {
				new RegExp(pattern, "i");
			} catch {
				ctx.ui.notify("Invalid regex pattern. Allowing this once.", "warning");
				return undefined;
			}

			const isPermanent = choice === "Allow & whitelist permanently";
			const rule: WhitelistRule = {
				id: generateId(),
				pattern,
				toolTypes: [event.toolName],
				scope: "session",
				description: `Allow ${event.toolName}: ${truncateDisplay(detection.reason, 60)}`,
				createdAt: Date.now(),
			};

			if (isPermanent) {
				// For permanent rules, add directly to global rules via the engine
				// We set scope to "session" in the type but addGlobalRule handles it
				engine.addGlobalRule(rule);
			} else {
				engine.addRule(rule);
				persistSessionWhitelist();
			}

			ctx.ui.notify(
				`✓ Whitelisted: ${pattern} (${choice === "Allow & whitelist permanently" ? "permanent" : "session"})`,
				"info",
			);
			return undefined;
		}

		// Block (choice === "Block" or undefined/timeout)
		return {
			block: true,
			reason: `Blocked by user: ${detection.reason}`,
		};
	});

	// --- Commands ---

	pi.registerCommand("guard-list", {
		description: "List all destructive-tool-guard whitelist rules",
		handler: async (_args, ctx) => {
			const sessionRules = engine.getSessionRules();
			const globalRules = engine.getGlobalRules();

			if (sessionRules.length === 0 && globalRules.length === 0) {
				ctx.ui.notify("No whitelist rules configured.", "info");
				return;
			}

			let msg = "";
			if (sessionRules.length > 0) {
				msg += "Session rules:\n";
				for (const r of sessionRules) {
					msg += `  • [${r.toolTypes.join(",")}] ${r.pattern} — ${r.description}\n`;
				}
			}
			if (globalRules.length > 0) {
				if (msg) msg += "\n";
				msg += "Global rules:\n";
				for (const r of globalRules) {
					msg += `  • [${r.toolTypes.join(",")}] ${r.pattern} — ${r.description}\n`;
				}
			}

			ctx.ui.notify(msg.trim(), "info");
		},
	});

	pi.registerCommand("guard-remove", {
		description: "Remove a whitelist rule",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Requires interactive mode", "error");
				return;
			}

			const allRules = engine.getAllRules();
			if (allRules.length === 0) {
				ctx.ui.notify("No whitelist rules to remove.", "info");
				return;
			}

			const options = allRules.map((r) => {
				const scope = r.scope === "session" ? "session" : "global";
				return `[${scope}] [${r.toolTypes.join(",")}] ${r.pattern} — ${r.description}`;
			});

			const choice = await ctx.ui.select("Remove which rule?", options);
			if (choice === undefined) return;

			const index = options.indexOf(choice);
			if (index >= 0) {
				const rule = allRules[index];
				engine.removeRule(rule.id);
				if (rule.scope === "session") {
					persistSessionWhitelist();
				}
				ctx.ui.notify(`Removed rule: ${rule.pattern}`, "info");
			}
		},
	});

	pi.registerCommand("guard-clear", {
		description: "Clear whitelist rules",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Requires interactive mode", "error");
				return;
			}

			const choice = await ctx.ui.select("Clear which whitelist?", [
				"Session rules only",
				"Global rules only",
				"Both",
				"Cancel",
			]);

			if (choice === "Cancel" || choice === undefined) return;

			if (choice === "Session rules only" || choice === "Both") {
				engine.clearSession();
				persistSessionWhitelist();
			}
			if (choice === "Global rules only" || choice === "Both") {
				engine.clearGlobal();
			}

			ctx.ui.notify(`Cleared: ${choice}`, "info");
		},
	});

	pi.registerCommand("guard-test", {
		description: "Test if a command would be flagged as destructive",
		handler: async (args, ctx) => {
			if (!args) {
				ctx.ui.notify(
					"Usage: /guard-test <command>\nExample: /guard-test rm -rf /tmp/data",
					"info",
				);
				return;
			}

			const detection = isBashDestructive(args);
			const whitelisted = engine.isWhitelisted("bash", args);

			let msg = `Command: ${args}\n`;
			msg += `Destructive: ${detection.detected ? "YES" : "no"}\n`;
			if (detection.detected) {
				msg += `Reason: ${detection.reason}\n`;
			}
			if (whitelisted) {
				msg += `Whitelisted: YES (rule: ${whitelisted.pattern})\n`;
				msg += `Would be: ALLOWED\n`;
			} else if (detection.detected) {
				msg += `Would be: BLOCKED (pending user approval)\n`;
			} else {
				msg += `Would be: ALLOWED\n`;
			}

			ctx.ui.notify(msg.trim(), detection.detected ? "warning" : "info");
		},
	});
}
