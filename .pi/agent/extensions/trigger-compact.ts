import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextUsage, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

const COMPACT_THRESHOLD_PERCENT = 72;
const COMPACT_COOLDOWN_MS = 90_000;
const NO_PROGRESS_RATIO = 0.92;
const MAX_NO_PROGRESS_ATTEMPTS = 2;
const COMPACTION_SUMMARY_CUSTOM_TYPE = "compaction-summary-card";

const BASE_COMPACT_INSTRUCTIONS = `
## Compact Instructions (Critical)
Write a continuation summary that enables immediate task resumption with minimal drift.

Required sections:
1) Task Overview
2) Current State
3) Important Discoveries
4) Next Steps
5) Context to Preserve

Must include:
- Exact file paths read/modified/created
- Decisions made and why
- Failed attempts and what should NOT be retried
- Pending verification commands/checks
- Open questions and blockers
- User preferences and explicit constraints
- Promises/commitments already made to the user
- If subagents were used: each agent's key conclusion and any conflicts

Be concise but complete. Optimize for correct continuation, not prose quality.
`;

interface CompactionSummaryDetails {
	source: "auto" | "manual";
	summary: string;
	tokensBefore: number | null;
	tokensAfter: number | null;
	reductionPercent: number | null;
	percentBefore: number | null;
	thresholdPercent: number;
}

function percentToDisplay(percent: number | null): string {
	if (percent === null) return "unknown";
	return `${percent.toFixed(1)}%`;
}

function formatTokenCount(tokens: number | null): string {
	if (tokens === null) return "unknown";
	return tokens.toLocaleString();
}

function shouldCompact(usage: ContextUsage): boolean {
	return usage.percent !== null && usage.percent >= COMPACT_THRESHOLD_PERCENT;
}

function joinCompactInstructions(customInstructions?: string): string {
	return [BASE_COMPACT_INSTRUCTIONS.trim(), customInstructions?.trim()].filter(Boolean).join("\n\n");
}

export default function (pi: ExtensionAPI) {
	let compactInFlight = false;
	let autoCompactionPaused = false;
	let consecutiveNoProgress = 0;
	let lastCompactionAt = 0;

	pi.registerMessageRenderer<CompactionSummaryDetails>(COMPACTION_SUMMARY_CUSTOM_TYPE, (message, { expanded }, theme) => {
		const details = message.details as CompactionSummaryDetails | undefined;
		if (!details) {
			const fallback = typeof message.content === "string" ? message.content : "Compaction summary";
			return new Text(fallback, 0, 0);
		}

		const sourceLabel = details.source === "auto" ? "Auto" : "Manual";
		const reductionText = details.reductionPercent === null ? "" : ` • ${details.reductionPercent.toFixed(1)}% reduction`;

		let text = theme.fg("accent", theme.bold("Compaction summary"));
		text += `\n${theme.fg("muted", `${sourceLabel}: ${formatTokenCount(details.tokensBefore)} → ${formatTokenCount(details.tokensAfter)} tokens${reductionText}`)}`;

		if (details.source === "auto") {
			text += `\n${theme.fg("dim", `Triggered at ${percentToDisplay(details.percentBefore)} (threshold ${details.thresholdPercent.toFixed(1)}%)`)}`;
		}

		if (expanded) {
			text += `\n\n${details.summary}`;
		} else {
			text += `\n${theme.fg("muted", "(Ctrl+O to expand summary)")}`;
		}

		return new Text(text, 0, 0);
	});

	pi.on("context", async (event) => {
		return {
			messages: event.messages.filter((m) => {
				const message = m as AgentMessage & { customType?: string };
				return !(message.role === "custom" && message.customType === COMPACTION_SUMMARY_CUSTOM_TYPE);
			}),
		};
	});

	const triggerCompaction = (ctx: ExtensionContext, customInstructions?: string, source: "auto" | "manual" = "auto") => {
		if (compactInFlight) return;

		const usageBefore = ctx.getContextUsage();
		const beforeTokens = usageBefore?.tokens ?? null;

		compactInFlight = true;
		if (ctx.hasUI) {
			const usageText = usageBefore ? ` (${beforeTokens ?? "?"} tokens, ${percentToDisplay(usageBefore.percent)})` : "";
			ctx.ui.notify(`Compaction started${usageText}`, "info");
		}

		ctx.compact({
			customInstructions: joinCompactInstructions(customInstructions),
			onComplete: (result) => {
				compactInFlight = false;
				lastCompactionAt = Date.now();

				const usageAfter = ctx.getContextUsage();
				const afterTokens = usageAfter?.tokens ?? null;
				const compactionTokensBefore = beforeTokens ?? result.tokensBefore ?? null;

				let reductionPercent: number | null = null;
				let progressMessage = "Compaction completed";

				if (compactionTokensBefore !== null && afterTokens !== null) {
					reductionPercent = compactionTokensBefore > 0 ? ((compactionTokensBefore - afterTokens) / compactionTokensBefore) * 100 : 0;
					progressMessage += ` (${compactionTokensBefore} → ${afterTokens} tokens, ${reductionPercent.toFixed(1)}% reduction)`;

					const madeInsufficientProgress =
						compactionTokensBefore > 0 && afterTokens >= compactionTokensBefore * NO_PROGRESS_RATIO;
					if (madeInsufficientProgress && source === "auto") {
						consecutiveNoProgress += 1;
						if (consecutiveNoProgress >= MAX_NO_PROGRESS_ATTEMPTS) {
							autoCompactionPaused = true;
							if (ctx.hasUI) {
								ctx.ui.notify(
									"Auto-compaction paused: low compaction gain repeatedly detected. Use /trigger-compact manually when needed.",
									"warning",
								);
							}
						}
					} else {
						consecutiveNoProgress = 0;
					}
				}

				if (ctx.hasUI) {
					ctx.ui.notify(progressMessage, "info");
					pi.sendMessage<CompactionSummaryDetails>(
						{
							customType: COMPACTION_SUMMARY_CUSTOM_TYPE,
							content: "Compaction summary",
							display: true,
							details: {
								source,
								summary: result.summary,
								tokensBefore: compactionTokensBefore,
								tokensAfter: afterTokens,
								reductionPercent,
								percentBefore: usageBefore?.percent ?? null,
								thresholdPercent: COMPACT_THRESHOLD_PERCENT,
							},
						},
						{ triggerTurn: false },
					);
				}
			},
			onError: (error) => {
				compactInFlight = false;
				if (ctx.hasUI) {
					ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
				}
			},
		});
	};

	pi.on("agent_end", (_event, ctx) => {
		if (compactInFlight || autoCompactionPaused) return;
		if (Date.now() - lastCompactionAt < COMPACT_COOLDOWN_MS) return;

		const usage = ctx.getContextUsage();
		if (!usage || !shouldCompact(usage)) return;

		triggerCompaction(ctx, undefined, "auto");
	});

	pi.registerCommand("trigger-compact", {
		description: "Trigger compaction immediately (optional custom instructions)",
		handler: async (args, ctx) => {
			autoCompactionPaused = false;
			consecutiveNoProgress = 0;
			const instructions = args.trim() || undefined;
			triggerCompaction(ctx, instructions, "manual");
		},
	});
}
