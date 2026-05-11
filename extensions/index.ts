import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { HarnessGalleryDemo, type HarnessCard } from "./factory-tui-demo.js";
import {
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
	existsSync,
	unlinkSync,
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

function projectProfilePath(id: string): string {
	return join(projectProfileDir, `${id}.json`);
}

function isProjectProfile(id: string): boolean {
	return existsSync(projectProfilePath(id));
}

function deleteProjectProfile(id: string): boolean {
	if (!isProjectProfile(id)) return false;
	unlinkSync(projectProfilePath(id));
	return true;
}

function clearActiveProfile() {
	if (existsSync(activePath)) unlinkSync(activePath);
}

function findProfile(id: string): HarnessProfile | undefined {
	return loadAllProfiles().find((profile) => profile.id === id);
}

function cloneProfile(
	profile: HarnessProfile,
	displayName: string,
): HarnessProfile {
	return {
		...profile,
		id: slugify(displayName),
		displayName,
		description: `Project-local copy of ${profile.id}.`,
		ui: {
			...profile.ui,
			statusLabel: slugify(displayName).toUpperCase().slice(0, 20),
		},
		memory: [...profile.memory],
		tools: {
			...profile.tools,
			allowed: [...profile.tools.allowed],
			blocked: [...profile.tools.blocked],
		},
		guards: { ...profile.guards },
		workflow: { ...profile.workflow },
		policies: profile.policies ? { ...profile.policies } : undefined,
		packages: profile.packages
			? {
					recommended: [...profile.packages.recommended],
					allowed: [...profile.packages.allowed],
					installCommands: [...profile.packages.installCommands],
				}
			: undefined,
		capabilities: profile.capabilities
			? Object.fromEntries(
					Object.entries(profile.capabilities).map(([name, capability]) => [
						name,
						{ ...capability },
					]),
				)
			: undefined,
	};
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

function normalizeChoice(value: string, fallback: string): string {
	return value.split("—")[0]?.trim() || fallback;
}

function buildHarnessingProfile(options: {
	displayName: string;
	role: string;
	preset: string;
	mutationScope: string;
	validationStrictness: string;
	safetyLevel: string;
	autonomy: string;
	outputStyle: string;
}): HarnessProfile {
	const role = normalizeChoice(options.role, "Coder");
	const mutationScope = normalizeChoice(options.mutationScope, "Minimal edits");
	const validationStrictness = normalizeChoice(
		options.validationStrictness,
		"After edits",
	);
	const safetyLevel = normalizeChoice(options.safetyLevel, "Strict");
	const autonomy = normalizeChoice(options.autonomy, "Plan then act");
	const outputStyle = normalizeChoice(options.outputStyle, "Concise summary");
	const readOnly = mutationScope === "Read-only" || role === "Reviewer";
	const id = slugify(options.displayName);
	const type = role.toLowerCase().replace(/\s+\/\s+/g, "-");
	const alwaysValidate = ["Always", "Test-first", "Release-grade"].includes(
		validationStrictness,
	);
	const testFirst = validationStrictness === "Test-first";
	const strictSafety = ["Strict", "Read-only", "Release-safe"].includes(
		safetyLevel,
	);
	const allowedTools = readOnly
		? ["read", "bash"]
		: role === "Researcher"
			? ["read", "write", "edit", "bash", "web_search", "fetch_content"]
			: ["read", "write", "edit", "bash"];
	const blockedTools = readOnly ? ["write", "edit"] : [];
	const memory = [
		`Role: ${role}.`,
		`Role preset: ${options.preset}.`,
		`Mutation scope: ${mutationScope}.`,
		`Validation strictness: ${validationStrictness}.`,
		`Safety level: ${safetyLevel}.`,
		`Autonomy: ${autonomy}.`,
		`Output style: ${outputStyle}.`,
	];
	return {
		id,
		displayName: options.displayName,
		type,
		description: `${role} harness generated from ${options.preset}.`,
		persona: `${role} harness compiled from functional constraints: ${mutationScope}, ${validationStrictness}, ${safetyLevel}, ${autonomy}.`,
		policies: {
			role,
			preset: options.preset,
			mutationScope,
			validationStrictness,
			safetyLevel,
			autonomy,
			outputStyle,
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
			codeDiagnostics: { enabled: role !== "Researcher", provider: "pi-lens" },
			largeOutputProcessing: { enabled: true, provider: "context-mode" },
			structuredClarification: { enabled: true, provider: "pi-ask-user" },
			webResearch: {
				enabled: role === "Researcher",
				provider: "pi-web-access",
			},
			subagents: { enabled: false, provider: "pi-subagents" },
		},
		tools: { allowed: allowedTools, blocked: blockedTools, readOnly },
		guards: {
			confirmDangerousCommands: safetyLevel !== "Lightweight",
			blockSecrets: safetyLevel !== "Lightweight",
			protectEnvFiles: safetyLevel !== "Lightweight",
			confirmGitPush: strictSafety,
			confirmDeletes: safetyLevel !== "Lightweight",
		},
		workflow: {
			requirePlanBeforeEdit:
				autonomy === "Plan then act" ||
				autonomy === "Review-gated" ||
				testFirst,
			runTestsAfterEdit:
				alwaysValidate || validationStrictness === "After edits",
			summarizeChanges: outputStyle !== "Detailed rationale" || true,
		},
		ui: { statusLabel: id.toUpperCase().slice(0, 20), themeHint: "green" },
		memory,
	};
}

export function buildCoderProfile(options: {
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

function getEnabledKeys(values: Record<string, boolean | undefined>): string[] {
	return Object.entries(values)
		.filter(([, enabled]) => enabled)
		.map(([name]) => name);
}

function inferSafetyLevel(profile: HarnessProfile): string {
	const enabledGuards = getEnabledKeys(profile.guards).length;
	if (profile.tools.readOnly || enabledGuards >= 4) return "Very High";
	if (enabledGuards >= 2) return "High";
	if (enabledGuards === 1) return "Medium";
	return "Low";
}

function inferAutonomyLevel(profile: HarnessProfile): string {
	if (profile.tools.readOnly) return "Low";
	if (profile.workflow.requirePlanBeforeEdit || profile.guards.confirmDeletes)
		return "Medium";
	return "High";
}

function profileKind(profile: HarnessProfile): string {
	if (profile.type) return profile.type;
	if (profile.id.includes("review") || /review/i.test(profile.displayName))
		return "reviewer";
	if (profile.id.includes("research") || /research/i.test(profile.displayName))
		return "researcher";
	if (profile.id.includes("devops") || /deploy|ops/i.test(profile.displayName))
		return "devops";
	return "coder";
}

function profileIcon(profile: HarnessProfile): string {
	const kind = profileKind(profile);
	if (kind === "reviewer") return "🔍";
	if (kind === "researcher") return "📚";
	if (kind === "devops") return "🚀";
	return "🛠";
}

function bestFor(profile: HarnessProfile): string {
	const kind = profileKind(profile);
	if (kind === "reviewer") return "reviewing diffs, finding risks";
	if (kind === "researcher") return "evidence gathering, source-backed answers";
	if (kind === "devops") return "diagnostics, deployment planning";
	return "implementation, refactors, code changes";
}

export function renderHarnessCard(
	profile: HarnessProfile,
	options: { active?: boolean } = {},
): string {
	const marker = options.active ? "* " : "";
	const guardSummary = getEnabledKeys(profile.guards).join(", ") || "none";
	const workflowSummary = getEnabledKeys(profile.workflow).join(", ") || "none";
	const title = `${marker}${profileIcon(profile)} ${profile.displayName} (${profile.id})`;
	return [
		`┌─ ${title} ─`,
		`│ ${profile.description}`,
		`│ Best for: ${bestFor(profile)}`,
		`│ Safety: ${inferSafetyLevel(profile)} · Autonomy: ${inferAutonomyLevel(profile)}`,
		`│ Guards: ${guardSummary}`,
		`│ Workflow: ${workflowSummary}`,
		`│ Use: /factory pick ${profile.id}`,
		"└────────────────────────────────────────",
	].join("\n");
}

export function renderHarnessGallery(
	profiles: HarnessProfile[],
	activeId?: string,
): string {
	return [
		"Harness cards",
		"Run /factory browse for an interactive selector, or /factory pick <id> for an action menu.",
		"",
		...profiles.map((profile) =>
			renderHarnessCard(profile, { active: profile.id === activeId }),
		),
	].join("\n\n");
}

function toHarnessCard(profile: HarnessProfile): HarnessCard {
	return {
		id: profile.id,
		displayName: profile.displayName,
		description: profile.description,
		type: profile.type,
		icon: profileIcon(profile),
		bestFor: bestFor(profile),
		safetyLevel: inferSafetyLevel(profile),
		autonomyLevel: inferAutonomyLevel(profile),
		statusLabel: profile.ui.statusLabel,
		guards: getEnabledKeys(profile.guards),
		workflow: getEnabledKeys(profile.workflow),
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

		if (!command) {
			const action = await ctx.ui.select("Harness Factory", [
				"Use a harness",
				"Create a harness",
				"Current harness",
				"Manage harnesses",
			]);
			if (action === "Use a harness") {
				await handleFactoryCommand("browse", ctx);
				return;
			}
			if (action === "Create a harness") {
				await handleFactoryCommand("create", ctx);
				return;
			}
			if (action === "Current harness") {
				await handleFactoryCommand("active", ctx);
				return;
			}
			if (action === "Manage harnesses") {
				await handleFactoryCommand("manage", ctx);
				return;
			}
			ctx.ui.notify("Factory cancelled", "info");
			return;
		}

		if (command === "browse") {
			const selectedId = await ctx.ui.custom(
				(
					_tui: unknown,
					_theme: unknown,
					_keybindings: unknown,
					done: (result: string | undefined) => void,
				) => {
					const component = new HarnessGalleryDemo(profiles.map(toHarnessCard));
					component.onSelect = (profileId) => done(profileId);
					component.onCancel = () => done(undefined);
					return component;
				},
			);
			if (typeof selectedId === "string" && selectedId) {
				await handleFactoryCommand(`pick ${selectedId}`, ctx);
			} else {
				ctx.ui.notify("Browse cancelled", "info");
			}
			return;
		}

		if (command === "help") {
			ctx.ui.notify(
				"Usage: /factory | /factory browse | /factory list | /factory pick [id] | /factory create | /factory manage | /factory use [id] | /factory preview [id] | /factory active",
				"info",
			);
			return;
		}

		if (command === "list") {
			ctx.ui.notify(renderHarnessGallery(profiles, active?.id), "info");
			return;
		}

		if (command === "manage") {
			const action = await ctx.ui.select("Manage harnesses", [
				"Duplicate harness",
				"Edit project harness",
				"Delete project harness",
				"Import / Export",
			]);
			if (action === "Duplicate harness") {
				const sourceId = await ctx.ui.select(
					"Duplicate source harness",
					profiles.map((profile) => profile.id),
				);
				const source = sourceId ? findProfile(sourceId) : undefined;
				if (!source) {
					ctx.ui.notify("Duplicate cancelled", "info");
					return;
				}
				const displayName = await ctx.ui.input(
					"New harness name",
					`${source.displayName} Copy`,
				);
				if (!displayName) {
					ctx.ui.notify("Duplicate cancelled", "info");
					return;
				}
				const copy = cloneProfile(source, displayName);
				if (findProfile(copy.id)) {
					ctx.ui.notify(`Profile already exists: ${copy.id}`, "error");
					return;
				}
				const saveAction = await ctx.ui.select("Save duplicated harness?", [
					"Save only",
					"Save & Activate",
					"Cancel",
				]);
				if (saveAction === "Cancel") {
					ctx.ui.notify("Duplicate cancelled", "info");
					return;
				}
				const ok = await ctx.ui.confirm("Duplicate harness?", preview(copy));
				if (!ok) {
					ctx.ui.notify("Duplicate cancelled", "info");
					return;
				}
				saveProjectProfile(copy);
				if (saveAction === "Save & Activate") {
					active = copy;
					saveActiveProfile(copy);
					ctx.ui.setStatus("harness-factory", copy.ui.statusLabel);
				}
				ctx.ui.notify(
					`Duplicated harness profile: ${copy.displayName} (${copy.id})`,
					"info",
				);
				return;
			}
			if (action === "Edit project harness") {
				const projectProfiles = loadProjectProfiles();
				if (!projectProfiles.length) {
					ctx.ui.notify(
						"No project-local harnesses to edit. Duplicate or create one first.",
						"info",
					);
					return;
				}
				const targetId = await ctx.ui.select(
					"Edit project harness",
					projectProfiles.map((profile) => profile.id),
				);
				const target = targetId ? findProfile(targetId) : undefined;
				if (!target || !targetId) {
					ctx.ui.notify("Edit cancelled", "info");
					return;
				}
				const mutationScope = await ctx.ui.select("What can it change?", [
					"Read-only — no write/edit",
					"Artifacts only — notes/plans, not source code",
					"Minimal edits — small targeted changes only",
					"Focused refactors — refactors within requested area",
					"Broad refactors — restructure proactively when useful",
				]);
				const validationStrictness = await ctx.ui.select(
					"How strict should validation be?",
					[
						"Manual — validate only when asked",
						"After edits — run relevant tests after changes",
						"Always — run lint/typecheck/test when available",
						"Test-first — add/update tests before implementation when feasible",
						"Release-grade — test, typecheck, lint, smoke test, summarize risk",
					],
				);
				const safetyLevel = await ctx.ui.select("Which safety gates?", [
					"Lightweight — minimal confirmations",
					"Balanced — protect secrets and destructive operations",
					"Strict — confirm secrets, deletes, git push, dangerous commands",
					"Read-only — strict safety with no edits",
					"Release-safe — strict plus deployment/publish caution",
				]);
				const autonomy = await ctx.ui.select("How should it proceed?", [
					"Ask first — clarify before acting",
					"Plan then act — state a concise plan before edits",
					"Act within scope — proceed if request is clear",
					"Autonomous — complete multi-step tasks with fewer interruptions",
					"Review-gated — confirm before risky changes",
				]);
				const outputStyle = await ctx.ui.select(
					"How should it report results?",
					[
						"Concise summary — changed files and validation results",
						"Detailed rationale — decisions and tradeoffs",
						"Findings table — severity, file, issue, recommendation",
						"Artifact-first — write plans/specs/docs to files",
					],
				);
				if (
					!mutationScope ||
					!validationStrictness ||
					!safetyLevel ||
					!autonomy ||
					!outputStyle
				) {
					ctx.ui.notify("Edit cancelled", "info");
					return;
				}
				const updated = buildHarnessingProfile({
					displayName: target.displayName,
					role: String(target.policies?.role ?? target.type ?? "Custom"),
					preset: String(target.policies?.preset ?? "Edited project harness"),
					mutationScope,
					validationStrictness,
					safetyLevel,
					autonomy,
					outputStyle,
				});
				updated.id = target.id;
				updated.description = target.description;
				const ok = await ctx.ui.confirm(
					"Save harness edits?",
					preview(updated),
				);
				if (!ok) {
					ctx.ui.notify("Edit cancelled", "info");
					return;
				}
				saveProjectProfile(updated);
				if (active?.id === updated.id) {
					active = updated;
					saveActiveProfile(updated);
					ctx.ui.setStatus("harness-factory", updated.ui.statusLabel);
				}
				ctx.ui.notify(
					`Updated harness profile: ${updated.displayName} (${updated.id})`,
					"info",
				);
				return;
			}
			if (action === "Import / Export") {
				const transferAction = await ctx.ui.select("Import / Export", [
					"Export harness",
					"Import harness",
					"Cancel",
				]);
				if (transferAction === "Export harness") {
					const sourceId = await ctx.ui.select(
						"Export harness",
						profiles.map((profile) => profile.id),
					);
					const source = sourceId ? findProfile(sourceId) : undefined;
					if (!source) {
						ctx.ui.notify("Export cancelled", "info");
						return;
					}
					const outputPath = await ctx.ui.input(
						"Export path",
						`.pi/harness-factory/${source.id}.json`,
					);
					if (!outputPath) {
						ctx.ui.notify("Export cancelled", "info");
						return;
					}
					const ok = await ctx.ui.confirm(
						"Export harness?",
						`Write ${source.displayName} (${source.id}) to ${outputPath}?`,
					);
					if (!ok) {
						ctx.ui.notify("Export cancelled", "info");
						return;
					}
					const absoluteOutputPath = resolve(process.cwd(), outputPath);
					mkdirSync(dirname(absoluteOutputPath), { recursive: true });
					writeFileSync(
						absoluteOutputPath,
						JSON.stringify(source, null, 2) + "\n",
						"utf8",
					);
					ctx.ui.notify(`Exported harness profile: ${outputPath}`, "info");
					return;
				}
				if (transferAction === "Import harness") {
					const inputPath = await ctx.ui.input(
						"Import path",
						".pi/harness-factory/profile.json",
					);
					if (!inputPath) {
						ctx.ui.notify("Import cancelled", "info");
						return;
					}
					let imported: HarnessProfile;
					try {
						imported = JSON.parse(
							readFileSync(resolve(process.cwd(), inputPath), "utf8"),
						) as HarnessProfile;
					} catch (error) {
						ctx.ui.notify(
							`Import failed: ${(error as Error).message}`,
							"error",
						);
						return;
					}
					if (
						!imported.id ||
						!imported.displayName ||
						!imported.tools ||
						!imported.guards ||
						!imported.workflow ||
						!imported.ui ||
						!Array.isArray(imported.memory)
					) {
						ctx.ui.notify(
							"Import failed: invalid harness profile JSON",
							"error",
						);
						return;
					}
					if (findProfile(imported.id)) {
						ctx.ui.notify(`Profile already exists: ${imported.id}`, "error");
						return;
					}
					const ok = await ctx.ui.confirm("Import harness?", preview(imported));
					if (!ok) {
						ctx.ui.notify("Import cancelled", "info");
						return;
					}
					saveProjectProfile(imported);
					ctx.ui.notify(
						`Imported harness profile: ${imported.displayName} (${imported.id})`,
						"info",
					);
					return;
				}
				ctx.ui.notify("Import / Export cancelled", "info");
				return;
			}
			if (action === "Delete project harness") {
				const targetId = await ctx.ui.select(
					"Delete project harness",
					profiles.map((profile) => profile.id),
				);
				if (!targetId) {
					ctx.ui.notify("Delete cancelled", "info");
					return;
				}
				const target = findProfile(targetId);
				if (!target) {
					ctx.ui.notify(`Unknown harness profile: ${targetId}`, "error");
					return;
				}
				if (!isProjectProfile(targetId)) {
					ctx.ui.notify(
						"Bundled presets cannot be deleted. Duplicate a preset first, then delete the project-local copy.",
						"error",
					);
					return;
				}
				const ok = await ctx.ui.confirm(
					"Delete harness?",
					`Delete project-local harness ${target.displayName} (${target.id})?`,
				);
				if (!ok) {
					ctx.ui.notify("Delete cancelled", "info");
					return;
				}
				deleteProjectProfile(targetId);
				if (active?.id === targetId) {
					active = null;
					clearActiveProfile();
					ctx.ui.setStatus("harness-factory", undefined);
				}
				ctx.ui.notify(`Deleted harness profile: ${targetId}`, "info");
				return;
			}
			ctx.ui.notify(
				`${action ?? "Manage action"} is not implemented yet.`,
				"info",
			);
			return;
		}

		if (command === "pick") {
			const selectedId =
				id ??
				(await ctx.ui.select(
					"Pick a harness",
					profiles.map((profile) => profile.id),
				));
			if (!selectedId) {
				ctx.ui.notify("Pick cancelled", "info");
				return;
			}
			const selectedProfile = findProfile(selectedId);
			if (!selectedProfile) {
				ctx.ui.notify(`Unknown harness profile: ${selectedId}`, "error");
				return;
			}
			const action = await ctx.ui.select(
				`${selectedProfile.displayName} selected`,
				["Activate", "Preview full policy", "Cancel"],
			);
			if (action === "Activate") {
				saveActiveProfile(selectedProfile);
				active = selectedProfile;
				ctx.ui.setStatus("harness-factory", selectedProfile.ui.statusLabel);
				ctx.ui.notify(
					`Activated harness: ${selectedProfile.displayName}. Run /reload if other generated files are added later.`,
					"info",
				);
				return;
			}
			if (action === "Preview full policy") {
				ctx.ui.notify(preview(selectedProfile), "info");
				return;
			}
			ctx.ui.notify("Pick cancelled", "info");
			return;
		}

		if (command === "active") {
			ctx.ui.notify(
				active ? preview(active) : "No active harness profile.",
				"info",
			);
			return;
		}

		if (command === "demo-wizard") {
			const action = await ctx.ui.select("Factory wizard demo", [
				"Create harness",
				"Browse harnesses",
				"Inspect active harness",
			]);
			ctx.ui.notify(
				action ? `Wizard demo selected: ${action}` : "Wizard demo cancelled",
				"info",
			);
			return;
		}

		if (command === "demo-tui") {
			await handleFactoryCommand("browse", ctx);
			return;
		}

		if (command === "create") {
			const role = id
				? id
				: await ctx.ui.select("What kind of harness?", [
						"Coder — implements code changes",
						"Reviewer — reviews code, diffs, plans, and risks",
						"Researcher — gathers evidence and cites sources",
						"DevOps — handles diagnostics, infra, deploy workflows",
						"PM / Writer — writes specs, plans, docs, tickets",
						"Custom — start from a blank configurable harness",
					]);
			if (!role) {
				ctx.ui.notify("Create cancelled", "info");
				return;
			}
			const normalizedRole = normalizeChoice(role, "Coder");
			const preset = await ctx.ui.select(`${normalizedRole} harness preset`, [
				"Safe implementation — minimal edits, safety gates, tests after edits",
				"Strict TDD — test-first, strict structure, full validation",
				"Read-only review — no write/edit, findings only",
				"Evidence researcher — citations, facts vs assumptions",
				"Release operator — deployment readiness and rollback risk",
			]);
			const displayName = await ctx.ui.input(
				"Harness name",
				`${normalizedRole} Harness`,
			);
			const mutationScope = await ctx.ui.select("What can it change?", [
				"Read-only — no write/edit",
				"Artifacts only — notes/plans, not source code",
				"Minimal edits — small targeted changes only",
				"Focused refactors — refactors within requested area",
				"Broad refactors — restructure proactively when useful",
			]);
			const validationStrictness = await ctx.ui.select(
				"How strict should validation be?",
				[
					"Manual — validate only when asked",
					"After edits — run relevant tests after changes",
					"Always — run lint/typecheck/test when available",
					"Test-first — add/update tests before implementation when feasible",
					"Release-grade — test, typecheck, lint, smoke test, summarize risk",
				],
			);
			const safetyLevel = await ctx.ui.select("Which safety gates?", [
				"Lightweight — minimal confirmations",
				"Balanced — protect secrets and destructive operations",
				"Strict — confirm secrets, deletes, git push, dangerous commands",
				"Read-only — strict safety with no edits",
				"Release-safe — strict plus deployment/publish caution",
			]);
			const autonomy = await ctx.ui.select("How should it proceed?", [
				"Ask first — clarify before acting",
				"Plan then act — state a concise plan before edits",
				"Act within scope — proceed if request is clear",
				"Autonomous — complete multi-step tasks with fewer interruptions",
				"Review-gated — confirm before risky changes",
			]);
			const outputStyle = await ctx.ui.select("How should it report results?", [
				"Concise summary — changed files and validation results",
				"Detailed rationale — decisions and tradeoffs",
				"Findings table — severity, file, issue, recommendation",
				"Artifact-first — write plans/specs/docs to files",
			]);
			if (
				!preset ||
				!displayName ||
				!mutationScope ||
				!validationStrictness ||
				!safetyLevel ||
				!autonomy ||
				!outputStyle
			) {
				ctx.ui.notify("Create cancelled", "info");
				return;
			}
			const profile = buildHarnessingProfile({
				displayName,
				role,
				preset,
				mutationScope,
				validationStrictness,
				safetyLevel,
				autonomy,
				outputStyle,
			});
			if (findProfile(profile.id)) {
				ctx.ui.notify(`Profile already exists: ${profile.id}`, "error");
				return;
			}
			const saveAction = await ctx.ui.select("Save generated harness?", [
				"Save only",
				"Save & Activate",
				"Cancel",
			]);
			if (saveAction === "Cancel") {
				ctx.ui.notify("Create cancelled", "info");
				return;
			}
			const ok = await ctx.ui.confirm("Create harness?", preview(profile));
			if (!ok) {
				ctx.ui.notify("Create cancelled", "info");
				return;
			}
			saveProjectProfile(profile);
			if (saveAction === "Save & Activate") {
				active = profile;
				saveActiveProfile(profile);
				ctx.ui.setStatus("harness-factory", profile.ui.statusLabel);
			}
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
