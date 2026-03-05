/**
 * System Prompt Header Extension
 *
 * - Dumps effective system prompt to /tmp/prompt.txt for inspection.
 * - Injects ~/.pi/agent/SYSTEM.md (or nearest project .pi/SYSTEM.md) once per session
 *   as hidden runtime policy context.
 * - Re-injects full available skill files after compaction as hidden context.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PROMPT_DUMP_PATH = "/tmp/prompt.txt";
const USER_SYSTEM_POLICY_PATH = path.join(os.homedir(), ".pi", "agent", "SYSTEM.md");
const MAX_POLICY_CHARS = 12_000;

type PolicyCache = {
	path: string;
	mtimeMs: number;
	content: string;
};

type SkillCache = {
	mtimeMs: number;
	content: string;
};

type LoadedSkill = {
	path: string;
	content: string;
};

function findNearestProjectPolicyPath(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".pi", "SYSTEM.md");
		if (existsSync(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

function resolvePolicyPath(cwd: string): string | null {
	return findNearestProjectPolicyPath(cwd) ?? (existsSync(USER_SYSTEM_POLICY_PATH) ? USER_SYSTEM_POLICY_PATH : null);
}

function decodeXml(value: string): string {
	return value
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

function extractSkillPathsFromSystemPrompt(systemPrompt: string): string[] {
	const skillsSectionMatch = systemPrompt.match(/<available_skills>[\s\S]*?<\/available_skills>/);
	if (!skillsSectionMatch) return [];

	const seen = new Set<string>();
	const paths: string[] = [];
	const locationRegex = /<location>([\s\S]*?)<\/location>/g;
	let match: RegExpExecArray | null;

	while ((match = locationRegex.exec(skillsSectionMatch[0])) !== null) {
		const skillPath = decodeXml(match[1].trim());
		if (!skillPath || seen.has(skillPath)) continue;
		seen.add(skillPath);
		paths.push(skillPath);
	}

	return paths;
}

function toRuntimePolicyText(policyPath: string, content: string): string {
	const trimmed = content.trim();
	const body =
		trimmed.length <= MAX_POLICY_CHARS
			? trimmed
			: `${trimmed.slice(0, MAX_POLICY_CHARS)}\n\n[Truncated runtime policy to ${MAX_POLICY_CHARS} characters.]`;

	return [
		"[PI SYSTEM POLICY - HIDDEN CONTEXT]",
		`Source: ${policyPath}`,
		"Apply this policy for plan mode decisions, delegation, result synthesis, and compaction continuity.",
		"",
		body,
		"[/PI SYSTEM POLICY - HIDDEN CONTEXT]",
	].join("\n");
}

function toRuntimeSkillsText(skills: LoadedSkill[], failedPaths: string[]): string {
	const lines: string[] = [
		"[PI SKILLS - HIDDEN CONTEXT]",
		"Source: available skill locations from the current system prompt.",
		"Reloaded full skill files after compaction to preserve runtime behavior.",
		"",
	];

	for (const skill of skills) {
		lines.push(`<skill-file path=\"${skill.path}\">`);
		lines.push(skill.content.trimEnd());
		lines.push("</skill-file>");
		lines.push("");
	}

	if (failedPaths.length > 0) {
		lines.push("Unreadable skill files:");
		for (const failedPath of failedPaths) {
			lines.push(`- ${failedPath}`);
		}
		lines.push("");
	}

	lines.push("[/PI SKILLS - HIDDEN CONTEXT]");
	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	let policyCache: PolicyCache | null = null;
	const skillCache = new Map<string, SkillCache>();
	let policyInjected = false;
	let skillReinjectPending = false;

	const resetPolicyInjection = () => {
		policyInjected = false;
	};

	const loadPolicy = (cwd: string): PolicyCache | null => {
		const policyPath = resolvePolicyPath(cwd);
		if (!policyPath) return null;

		try {
			const stat = statSync(policyPath);
			if (policyCache && policyCache.path === policyPath && policyCache.mtimeMs === stat.mtimeMs) {
				return policyCache;
			}

			const content = readFileSync(policyPath, "utf8");
			policyCache = {
				path: policyPath,
				mtimeMs: stat.mtimeMs,
				content,
			};
			return policyCache;
		} catch {
			return null;
		}
	};

	const loadSkillFile = (skillPath: string): string | null => {
		try {
			const stat = statSync(skillPath);
			const cached = skillCache.get(skillPath);
			if (cached && cached.mtimeMs === stat.mtimeMs) {
				return cached.content;
			}

			const content = readFileSync(skillPath, "utf8");
			skillCache.set(skillPath, { mtimeMs: stat.mtimeMs, content });
			return content;
		} catch {
			return null;
		}
	};

	const loadSkillsFromPrompt = (systemPrompt: string): { skills: LoadedSkill[]; failedPaths: string[] } => {
		const skillPaths = extractSkillPathsFromSystemPrompt(systemPrompt);
		const skills: LoadedSkill[] = [];
		const failedPaths: string[] = [];

		for (const skillPath of skillPaths) {
			const content = loadSkillFile(skillPath);
			if (content === null) {
				failedPaths.push(skillPath);
				continue;
			}
			skills.push({ path: skillPath, content });
		}

		return { skills, failedPaths };
	};

	pi.on("session_start", () => {
		resetPolicyInjection();
		skillReinjectPending = false;
	});

	pi.on("session_switch", () => {
		resetPolicyInjection();
		skillReinjectPending = false;
	});

	pi.on("session_compact", () => {
		// Re-inject policy after compaction so runtime behavior stays stable.
		resetPolicyInjection();
		skillReinjectPending = true;
	});

	pi.on("agent_start", (_event, ctx) => {
		const prompt = ctx.getSystemPrompt();
		writeFileSync(PROMPT_DUMP_PATH, prompt, "utf8");
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const hiddenBlocks: string[] = [];

		if (!policyInjected) {
			const policy = loadPolicy(ctx.cwd);
			if (policy && policy.content.trim()) {
				hiddenBlocks.push(toRuntimePolicyText(policy.path, policy.content));
				policyInjected = true;
			}
		}

		if (skillReinjectPending) {
			skillReinjectPending = false;
			const { skills, failedPaths } = loadSkillsFromPrompt(event.systemPrompt);
			if (skills.length > 0 || failedPaths.length > 0) {
				hiddenBlocks.push(toRuntimeSkillsText(skills, failedPaths));
			}
		}

		if (hiddenBlocks.length === 0) return;

		return {
			message: {
				customType: "runtime-hidden-context",
				content: hiddenBlocks.join("\n\n"),
				display: false,
			},
		};
	});
}
