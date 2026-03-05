/**
 * Modal Dialog Library Extension
 *
 * A reusable library for building floating modal dialogs with rich inputs.
 *
 * Usage from other extensions:
 *
 *   import { Modal, TextField, CheckboxGroup, RadioGroup, Toggle, Separator } from "~/.pi/extensions/modal-lib/index.ts";
 *
 *   const result = await Modal.show(ctx, {
 *     title: "My Dialog",
 *     fields: [
 *       TextField({ id: "name", label: "Name", placeholder: "enter name" }),
 *       Toggle({ id: "verbose", label: "Verbose", value: false }),
 *     ],
 *   });
 *
 *   if (!result.cancelled) {
 *     console.log(result.values); // { name: "...", verbose: true }
 *   }
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { Modal } from "./modal.ts";

export type {
	ModalConfig,
	ModalResult,
	TabConfig,
	FieldConfig,
	TextFieldConfig,
	SelectFieldConfig,
	SelectGroupConfig,
	CheckboxGroupConfig,
	RadioGroupConfig,
	ToggleConfig,
	SeparatorConfig,
} from "./types.ts";

// ─── Convenience Factory Functions ───────────────────────────────────────────
//
// These let consumers write: TextField({ id: "x", label: "X" })
// instead of:                 { type: "text", id: "x", label: "X" }

import type {
	TextFieldConfig as _TextFieldConfig,
	SelectFieldConfig as _SelectFieldConfig,
	SelectGroupConfig as _SelectGroupConfig,
	CheckboxGroupConfig as _CheckboxGroupConfig,
	RadioGroupConfig as _RadioGroupConfig,
	ToggleConfig as _ToggleConfig,
	SeparatorConfig as _SeparatorConfig,
} from "./types.ts";

export function TextField(config: Omit<_TextFieldConfig, "type">): _TextFieldConfig {
	return { type: "text", ...config };
}

export function SelectField(config: Omit<_SelectFieldConfig, "type">): _SelectFieldConfig {
	return { type: "select", ...config };
}

/** Alias for SelectField with more explicit naming for menu-style selection lists. */
export function SelectGroup(config: Omit<_SelectGroupConfig, "type">): _SelectGroupConfig {
	return SelectField(config);
}

export function CheckboxGroup(config: Omit<_CheckboxGroupConfig, "type">): _CheckboxGroupConfig {
	return { type: "checkbox", ...config };
}

export function RadioGroup(config: Omit<_RadioGroupConfig, "type">): _RadioGroupConfig {
	return { type: "radio", ...config };
}

export function Toggle(config: Omit<_ToggleConfig, "type">): _ToggleConfig {
	return { type: "toggle", ...config };
}

export function Separator(config?: Omit<_SeparatorConfig, "type">): _SeparatorConfig {
	return { type: "separator", ...config };
}

// ─── Extension Entry Point ───────────────────────────────────────────────────

// Re-export above doesn't create a local binding, so import for use here
import { Modal as _Modal } from "./modal.ts";

export default function modalLibExtension(pi: ExtensionAPI) {
	// Register /modal-demo to showcase the library
	pi.registerCommand("modal-demo", {
		description: "Demo the modal dialog library",
		handler: async (_args, ctx) => {
			const result = await _Modal.show(ctx, {
				title: "Modal Demo",
				tabs: [
					{
						label: "General",
						fields: [
							TextField({ id: "name", label: "Project Name", placeholder: "my-project" }),
							RadioGroup({
								id: "env",
								label: "Environment",
								options: ["development", "staging", "production"],
								value: "development",
							}),
							Toggle({ id: "dryRun", label: "Dry Run", value: true }),
							Separator(),
							Toggle({ id: "verbose", label: "Verbose Output", value: false }),
						],
					},
					{
						label: "Features",
						fields: [
							CheckboxGroup({
								id: "features",
								label: "Enable Features",
								options: [
									{ value: "cache", label: "Response Cache" },
									{ value: "logging", label: "Verbose Logging" },
									{ value: "metrics", label: "Performance Metrics" },
									{ value: "auth", label: "Authentication" },
								],
								value: ["cache"],
							}),
							Separator({ label: "Build" }),
							RadioGroup({
								id: "mode",
								label: "Build Mode",
								options: [
									{ value: "debug", label: "Debug" },
									{ value: "release", label: "Release" },
									{ value: "profile", label: "Profile" },
								],
								value: "debug",
							}),
						],
					},
					{
						label: "Advanced",
						fields: [
							TextField({ id: "timeout", label: "Timeout (ms)", value: "5000" }),
							TextField({ id: "retries", label: "Max Retries", value: "3" }),
							RadioGroup({
								id: "logLevel",
								label: "Log Level",
								options: ["trace", "debug", "info", "warn", "error"],
								value: "info",
							}),
						],
					},
				],
			});

			if (result.cancelled) {
				ctx.ui.notify("Modal cancelled", "info");
			} else {
				const summary = Object.entries(result.values)
					.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
					.join("\n");
				ctx.ui.notify(`Submitted:\n${summary}`, "info");
			}
		},
	});

}
