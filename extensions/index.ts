import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
	existsSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type HarnessProfile = {
	id: string;
	displayName: string;
	description: string;
	persona: string;
	type?: string;
	policies?: Record<string, string | boolean>;
	packages?: {
		recommended: string[];
		allowed: string[];
		installCommands: string[];
	};
	capabilities?: Record<string, { enabled: boolean; provider: string }>;
	tools: { allowed: string[]; blocked: string[]; readOnly: boolean };
	guards: {
		confirmDangerousCommands?: boolean;
		blockSecrets?: boolean;
		protectEnvFiles?: boolean;
		confirmGitPush?: boolean;
		confirmDeletes?: boolean;
	};
	workflow: {
		requirePlanBeforeEdit?: boolean;
		runTestsAfterEdit?: boolean;
		summarizeChanges?: boolean;
	};
	ui: { statusLabel: string; themeHint?: string };
	memory: string[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const presetDir = join(packageRoot, "presets");
const projectFactoryDir = resolve(process.cwd(), ".pi", "harness-factory");
const projectProfileDir = join(projectFactoryDir, "profiles");
const activePath = join(projectFactoryDir, "active.json");

function loadProfileDir(dir: string): HarnessProfile[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((file) => file.endsWith(".json"))
		.map(
			(file) =>
				JSON.parse(readFileSync(join(dir, file), "utf8")) as HarnessProfile,
		);
}

function loadPresets(): HarnessProfile[] {
	return loadProfileDir(presetDir).sort((a, b) => a.id.localeCompare(b.id));
}

function loadProjectProfiles(): HarnessProfile[] {
	return loadProfileDir(projectProfileDir).sort((a, b) =>
		a.id.localeCompare(b.id),
	);
}

function loadAllProfiles(): HarnessProfile[] {
	const merged = new Map<string, HarnessProfile>();
	for (const profile of loadPresets()) merged.set(profile.id, profile);
	for (const profile of loadProjectProfiles()) merged.set(profile.id, profile);
	return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function loadActiveProfile(): HarnessProfile | null {
	if (!existsSync(activePath)) return null;
	return JSON.parse(readFileSync(activePath, "utf8")) as HarnessProfile;
}

function saveActiveProfile(profile: HarnessProfile) {
	mkdirSync(projectFactoryDir, { recursive: true });
	writeFileSync(activePath, JSON.stringify(profile, null, 2) + "\n", "utf8");
}

function saveProjectProfile(profile: HarnessProfile) {
	mkdirSync(projectProfileDir, { recursive: true });
	writeFileSync(
		join(projectProfileDir, `${profile.id}.json`),
		JSON.stringify(profile, null, 2) + "\n",
		"utf8",
	);
}

function findProfile(id: string): HarnessProfile | undefined {
	return loadAllProfiles().find((profile) => profile.id === id);
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "custom-harness"
	);
}

export function isSensitivePath(value: unknown): boolean {
	if (typeof value !== "string") return false;
	return /(^|[/\\])\.env($|\.)|id_rsa|id_ed25519|\.pem$|\.key$|credentials|secret/i.test(
		value,
	);
}

export function commandLooksDangerous(command: string): string | null {
	if (/\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*|.*\s-rf\b)/.test(command))
		return "recursive delete";
	if (/\bsudo\b/.test(command)) return "sudo command";
	if (/\bgit\s+push\b.*(--force|-f)\b/.test(command)) return "force push";
	if (/\bchmod\s+777\b/.test(command)) return "overly broad chmod";
	return null;
}

export function commandRequiresConfirmation(
	command: string,
	guards: HarnessProfile["guards"],
): string | null {
	const danger = commandLooksDangerous(command);
	if (danger && guards.confirmDangerousCommands) return danger;
	if (guards.confirmGitPush && /\bgit\s+push\b/.test(command))
		return "git push";
	if (guards.confirmDeletes && /\b(rm|rmdir)\b/.test(command))
		return "delete command";
	return null;
}

export function buildHarnessInstructions(profile: HarnessProfile): string {
	const lines = [
		"# Active Pi Harness Profile",
		`Name: ${profile.displayName} (${profile.id})`,
		`Persona: ${profile.persona}`,
		profile.policies && Object.keys(profile.policies).length
			? `Policies: ${Object.entries(profile.policies)
					.map(([key, value]) => `${key}=${value}`)
					.join("; ")}`
			: undefined,
		"",
		"## Mandatory behavior",
		...profile.memory.map((entry) => `- ${entry}`),
		profile.workflow.requirePlanBeforeEdit
			? "- Before using write/edit or making code changes, state a concise plan unless the change is trivial or the user already supplied an exact patch."
			: undefined,
		profile.workflow.runTestsAfterEdit
			? "- After code edits, run the most relevant available validation commands (tests, typecheck, lint) or explain why they cannot be run."
			: undefined,
		profile.workflow.summarizeChanges
			? "- Finish implementation work with a concise summary of changed files and validation results."
			: undefined,
		profile.tools.readOnly
			? "- This harness is read-only: do not write or edit files."
			: undefined,
		profile.tools.blocked.length
			? `- Do not use blocked tools: ${profile.tools.blocked.join(", ")}.`
			: undefined,
		profile.guards.confirmDangerousCommands ||
		profile.guards.confirmDeletes ||
		profile.guards.confirmGitPush
			? "- Ask for confirmation before dangerous shell commands, deletes, or git push operations covered by this profile."
			: undefined,
		profile.guards.protectEnvFiles || profile.guards.blockSecrets
			? "- Protect secrets and sensitive files; ask before accessing .env, keys, credentials, or secret material."
			: undefined,
	];
	return lines.filter((line): line is string => line !== undefined).join("\n");
}

function buildCoderProfile(options: {
	displayName: string;
	styleStrictness: string;
	tddPolicy: string;
	changeScope: string;
	validationPolicy: string;
	additionalNotes?: string;
}): HarnessProfile {
	const id = slugify(options.displayName);
	const strictStyle = options.styleStrictness.startsWith("Strict");
	const tddRequired = options.tddPolicy.startsWith("Required");
	const tddPreferred = options.tddPolicy.startsWith("Preferred");
	const conservative = options.changeScope.startsWith("Conservative");
	const alwaysValidate = options.validationPolicy.startsWith("Always");
	const validateAfterEdits = options.validationPolicy.startsWith("After edits");
	const memory = [
		`Coding style: ${options.styleStrictness}.`,
		`TDD policy: ${options.tddPolicy}.`,
		`Change scope: ${options.changeScope}.`,
		`Validation policy: ${options.validationPolicy}.`,
		strictStyle
			? "Enforce naming, structure, formatting, and local architecture consistency."
			: "Match the existing project style without over-policing incidental differences.",
		tddRequired
			? "Require a failing or updated test before implementation when feasible."
			: tddPreferred
				? "Prefer tests before implementation, but allow pragmatic exceptions."
				: "Add tests when they materially reduce risk.",
		conservative
			? "Prefer minimal, reversible edits and avoid broad refactors."
			: "Allow necessary refactors when they improve the requested change.",
		"Protect secrets and sensitive files.",
	];
	if (options.additionalNotes?.trim()) {
		memory.push(`Additional project rule: ${options.additionalNotes.trim()}`);
	}
	return {
		id,
		displayName: options.displayName,
		type: "coder",
		description: "Custom coder harness generated by Pi Harness Factory.",
		persona:
			"Implementation-focused coding harness that adapts edit behavior to the selected style, TDD, change-scope, and validation policies.",
		policies: {
			styleStrictness: options.styleStrictness,
			tddPolicy: options.tddPolicy,
			changeScope: options.changeScope,
			validationPolicy: options.validationPolicy,
		},
		packages: {
			recommended: ["pi-lens", "context-mode", "pi-ask-user"],
			allowed: ["pi-lens", "context-mode", "pi-ask-user"],
			installCommands: [
				"pi install npm:pi-lens",
				"pi install npm:context-mode",
				"pi install npm:pi-ask-user",
			],
		},
		capabilities: {
			codeDiagnostics: { enabled: true, provider: "pi-lens" },
			largeOutputProcessing: { enabled: true, provider: "context-mode" },
			structuredClarification: { enabled: true, provider: "pi-ask-user" },
			webResearch: { enabled: false, provider: "pi-web-access" },
			subagents: { enabled: false, provider: "pi-subagents" },
		},
		tools: {
			allowed: ["read", "write", "edit", "bash"],
			blocked: [],
			readOnly: false,
		},
		guards: {
			confirmDangerousCommands: true,
			blockSecrets: true,
			protectEnvFiles: true,
			confirmGitPush: strictStyle || tddRequired,
			confirmDeletes: true,
		},
		workflow: {
			requirePlanBeforeEdit: strictStyle || tddRequired,
			runTestsAfterEdit: alwaysValidate || validateAfterEdits || tddRequired,
			summarizeChanges: true,
		},
		ui: { statusLabel: id.toUpperCase().slice(0, 20), themeHint: "green" },
		memory,
	};
}

function preview(profile: HarnessProfile): string {
	return [
		`${profile.displayName} (${profile.id})`,
		profile.description,
		`Persona: ${profile.persona}`,
		profile.type ? `Type: ${profile.type}` : undefined,
		`Tools: allowed=${profile.tools.allowed.join(", ") || "none"}; blocked=${profile.tools.blocked.join(", ") || "none"}; readOnly=${profile.tools.readOnly}`,
		`Guards: ${
			Object.entries(profile.guards)
				.filter(([, enabled]) => enabled)
				.map(([name]) => name)
				.join(", ") || "none"
		}`,
		`Workflow: ${
			Object.entries(profile.workflow)
				.filter(([, enabled]) => enabled)
				.map(([name]) => name)
				.join(", ") || "none"
		}`,
		`Status: ${profile.ui.statusLabel}`,
		profile.policies
			? `Policies: ${Object.entries(profile.policies)
					.map(([name, value]) => `${name}=${value}`)
					.join(", ")}`
			: undefined,
		profile.packages
			? `Packages: recommended=${profile.packages.recommended.join(", ") || "none"}; allowed=${profile.packages.allowed.join(", ") || "none"}`
			: undefined,
		profile.capabilities
			? `Capabilities: ${Object.entries(profile.capabilities)
					.map(
						([name, capability]) =>
							`${name}=${capability.enabled ? "on" : "off"}(${capability.provider})`,
					)
					.join(", ")}`
			: undefined,
		profile.packages?.installCommands.length
			? `Install commands:\n${profile.packages.installCommands.map((cmd) => `- ${cmd}`).join("\n")}`
			: undefined,
		`Memory:\n- ${profile.memory.join("\n- ")}`,
	]
		.filter((line): line is string => Boolean(line))
		.join("\n");
}

export default function (pi: ExtensionAPI) {
	let active = loadActiveProfile();

	pi.on("session_start", async (_event, ctx) => {
		if (active) {
			ctx.ui.setStatus("harness-factory", active.ui.statusLabel);
			ctx.ui.notify(`Harness active: ${active.displayName}`, "info");
		}
	});

	pi.on("before_agent_start", async (event) => {
		if (!active) return;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${buildHarnessInstructions(active)}`,
		};
	});

	const handleFactoryCommand = async (args: string, ctx: any) => {
		const [rawCommand, rawId] = args.trim().split(/\s+/);
		let command = rawCommand;
		let id = rawId;
		const profiles = loadAllProfiles();

		if (command && findProfile(command) && !id) {
			id = command;
			command = "preview";
		}

		if (command === "switch" || command === "activate") command = "use";
		if (command === "show" || command === "inspect") command = "preview";

		if (!command || command === "help") {
			ctx.ui.notify(
				"Usage: /factory list | create [coder] | use [id] | switch [id] | preview [id] | <profile-id> | active",
				"info",
			);
			return;
		}

		if (command === "list") {
			ctx.ui.notify(
				profiles
					.map(
						(profile) =>
							`${profile.id} — ${profile.displayName}: ${profile.description}`,
					)
					.join("\n"),
				"info",
			);
			return;
		}

		if (command === "active") {
			ctx.ui.notify(
				active ? preview(active) : "No active harness profile.",
				"info",
			);
			return;
		}

		if (command === "create") {
			const requestedType = id;
			const type = requestedType
				? requestedType.toLowerCase()
				: await ctx.ui.select("Harness type", [
						"coder",
						"reviewer",
						"researcher",
						"devops",
					]);
			if (!type) {
				ctx.ui.notify("Create cancelled", "info");
				return;
			}
			if (type !== "coder") {
				ctx.ui.notify(
					`Typed builder for '${type}' is not implemented yet. Try /factory create coder.`,
					"warning",
				);
				return;
			}

			const displayName = await ctx.ui.input(
				"Coder harness name",
				"Strict TDD Coder",
			);
			if (!displayName) {
				ctx.ui.notify("Create cancelled", "info");
				return;
			}
			const styleStrictness = await ctx.ui.select("Coding style strictness", [
				"Relaxed: follow existing style",
				"Balanced: lint/format consistency",
				"Strict: naming/structure/architecture",
			]);
			const tddPolicy = await ctx.ui.select("TDD policy", [
				"No: tests when useful",
				"Preferred: tests first when practical",
				"Required: failing test before implementation",
			]);
			const changeScope = await ctx.ui.select("Change scope", [
				"Conservative: minimal edits only",
				"Balanced: focused refactors allowed",
				"Aggressive: improve structure proactively",
			]);
			const validationPolicy = await ctx.ui.select("Validation policy", [
				"Manual: only when asked",
				"After edits: run relevant tests",
				"Always: lint/typecheck/test",
			]);
			if (!styleStrictness || !tddPolicy || !changeScope || !validationPolicy) {
				ctx.ui.notify("Create cancelled", "info");
				return;
			}
			const additionalNotes = await ctx.ui.input(
				"Additional coder rules (optional)",
				"e.g. prefer small functions and explicit errors",
			);
			const profile = buildCoderProfile({
				displayName,
				styleStrictness,
				tddPolicy,
				changeScope,
				validationPolicy,
				additionalNotes: additionalNotes ?? undefined,
			});
			if (findProfile(profile.id)) {
				ctx.ui.notify(`Profile already exists: ${profile.id}`, "error");
				return;
			}
			const ok = await ctx.ui.confirm(
				"Create coder harness?",
				preview(profile),
			);
			if (!ok) {
				ctx.ui.notify("Create cancelled", "info");
				return;
			}
			saveProjectProfile(profile);
			ctx.ui.notify(
				`Created harness profile: ${profile.displayName} (${profile.id})`,
				"info",
			);
			return;
		}

		if ((command === "use" || command === "preview") && !id) {
			const selected = await ctx.ui.select(
				command === "use" ? "Activate harness" : "Preview harness",
				profiles.map((profile) => profile.id),
			);
			if (!selected) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}
			id = selected;
		}

		if (!id) {
			ctx.ui.notify(`Missing profile id for /factory ${command}`, "error");
			return;
		}

		const profile = findProfile(id);
		if (!profile) {
			ctx.ui.notify(
				`Unknown harness profile: ${id}\nRun /factory list to see available profiles.`,
				"error",
			);
			return;
		}

		if (command === "preview") {
			ctx.ui.notify(preview(profile), "info");
			return;
		}

		if (command === "use") {
			saveActiveProfile(profile);
			active = profile;
			ctx.ui.setStatus("harness-factory", profile.ui.statusLabel);
			ctx.ui.notify(
				`Activated harness: ${profile.displayName}. Run /reload if other generated files are added later.`,
				"info",
			);
			return;
		}

		ctx.ui.notify(
			`Unknown factory command: ${command}\nUsage: /factory list | create [coder] | use [id] | preview [id] | <profile-id> | active`,
			"error",
		);
	};

	pi.registerCommand("factory", {
		description:
			"Create, switch, and inspect persona-based Pi harness profiles.",
		handler: handleFactoryCommand,
	});

	pi.registerCommand("facory", {
		description: "Typo alias for /factory.",
		handler: handleFactoryCommand,
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!active) return;

		if (active.tools.blocked.includes(event.toolName)) {
			return {
				block: true,
				reason: `${active.displayName} blocks ${event.toolName}`,
			};
		}

		if (active.tools.readOnly && ["write", "edit"].includes(event.toolName)) {
			return { block: true, reason: `${active.displayName} is read-only` };
		}

		const input = event.input as Record<string, unknown>;
		const pathValue = input.path ?? input.filePath;
		if (
			(active.guards.protectEnvFiles || active.guards.blockSecrets) &&
			isSensitivePath(pathValue)
		) {
			const ok = await ctx.ui.confirm(
				"Sensitive file",
				`${active.displayName}: allow access to ${String(pathValue)}?`,
			);
			if (!ok)
				return { block: true, reason: "Sensitive file access denied by user" };
		}

		if (event.toolName === "bash" && typeof input.command === "string") {
			const confirmationReason = commandRequiresConfirmation(
				input.command,
				active.guards,
			);
			if (confirmationReason) {
				const ok = await ctx.ui.confirm(
					"Command confirmation",
					`${active.displayName}: allow ${confirmationReason}?\n\n${input.command}`,
				);
				if (!ok)
					return {
						block: true,
						reason: `Blocked command requiring confirmation: ${confirmationReason}`,
					};
			}
		}
	});
}
