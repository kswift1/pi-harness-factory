import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { HarnessGalleryDemo } from "../.tmp-test/extensions/factory-tui-demo.js";
import registerHarnessFactory, {
	buildHarnessInstructions,
	commandRequiresConfirmation,
	isSensitivePath,
	renderHarnessCard,
	renderHarnessGallery,
} from "../.tmp-test/extensions/index.js";

const strictProfile = JSON.parse(
	readFileSync(".pi/harness-factory/profiles/strict-coder.json", "utf8"),
);

const card = renderHarnessCard(strictProfile, { active: true });
assert.match(card, /┌─ \* .*strict coder/);
assert.match(card, /Best for:/);
assert.match(card, /Safety:/);
assert.match(card, /Use: \/factory pick strict-coder/);

const reviewerProfile = JSON.parse(
	readFileSync("presets/code-reviewer.json", "utf8"),
);
const researcherProfile = JSON.parse(
	readFileSync("presets/researcher.json", "utf8"),
);
assert.match(renderHarnessCard(reviewerProfile), /🔍 Code Reviewer/);
assert.match(renderHarnessCard(reviewerProfile), /Best for: reviewing diffs/);
assert.match(renderHarnessCard(researcherProfile), /📚 Researcher/);
assert.match(
	renderHarnessCard(researcherProfile),
	/Best for: evidence gathering/,
);

const gallery = renderHarnessGallery([strictProfile], "strict-coder");
assert.match(gallery, /Harness cards/);
assert.match(gallery, /strict coder/);

const instructions = buildHarnessInstructions(strictProfile);
assert.match(instructions, /Active Pi Harness Profile/);
assert.match(instructions, /strict coder \(strict-coder\)/);
assert.match(instructions, /Before using write\/edit/);
assert.match(
	instructions,
	/run the most relevant available validation commands/,
);
assert.match(instructions, /Finish implementation work with a concise summary/);
assert.match(instructions, /rm rf 자동 사용 금지/);

assert.equal(isSensitivePath(".env"), true);
assert.equal(isSensitivePath("config/credentials.json"), true);
assert.equal(isSensitivePath("src/index.ts"), false);

assert.equal(
	commandRequiresConfirmation("rm -rf tmp", strictProfile.guards),
	"recursive delete",
);
assert.equal(
	commandRequiresConfirmation("git push origin main", strictProfile.guards),
	"git push",
);
assert.equal(
	commandRequiresConfirmation("rm tmp.txt", strictProfile.guards),
	"delete command",
);
assert.equal(
	commandRequiresConfirmation("npm test", strictProfile.guards),
	null,
);

function createRuntimeHarness() {
	const commands = new Map();
	const hooks = new Map();
	const notifications = [];
	const statuses = [];
	const confirmations = [];
	const selects = [];
	const selectResponses = [];
	const inputs = [];
	const inputResponses = [];
	const confirms = [];
	const confirmResponses = [];
	const customComponents = [];
	const pi = {
		registerCommand(name, config) {
			commands.set(name, config);
		},
		on(eventName, handler) {
			hooks.set(eventName, handler);
		},
	};
	const ctx = {
		ui: {
			notify(message, level = "info") {
				notifications.push({ message, level });
			},
			setStatus(key, value) {
				statuses.push({ key, value });
			},
			async confirm(title, message) {
				confirmations.push({ title, message });
				return confirmResponses.shift() ?? false;
			},
			async input(title, placeholder) {
				inputs.push({ title, placeholder });
				return inputResponses.shift() ?? placeholder;
			},
			async select(title, items) {
				selects.push({ title, items });
				return selectResponses.shift() ?? items[0];
			},
			async custom(factory) {
				assert.equal(typeof factory, "function");
				const component = await factory(null, null, null, () => {});
				customComponents.push(component);
				return undefined;
			},
		},
	};
	registerHarnessFactory(pi);
	return {
		commands,
		hooks,
		notifications,
		statuses,
		confirmations,
		selects,
		selectResponses,
		inputs,
		inputResponses,
		confirms,
		confirmResponses,
		customComponents,
		ctx,
	};
}

const runtime = createRuntimeHarness();
assert.equal(runtime.commands.has("factory"), true);
assert.equal(runtime.commands.has("facory"), false);
assert.equal(runtime.hooks.has("session_start"), true);
assert.equal(runtime.hooks.has("before_agent_start"), true);
assert.equal(runtime.hooks.has("tool_call"), true);

runtime.selectResponses.push("Current harness");
await runtime.commands.get("factory").handler("", runtime.ctx);
assert.equal(runtime.selects.at(-1).title, "Harness Factory");
assert.match(
	runtime.notifications.at(-1).message,
	/strict coder|No active harness profile/,
);

runtime.selectResponses.push("Use a harness");
await runtime.commands.get("factory").handler("", runtime.ctx);
assert.equal(
	runtime.customComponents.at(-1) instanceof HarnessGalleryDemo,
	true,
);
assert.match(
	runtime.customComponents.at(-1).render(80).join("\n"),
	/Harness Factory · Select a harness/,
);

const safeCopyName = `Safe Copy ${process.pid} ${Date.now()}`;
const safeCopyId = safeCopyName
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, "-")
	.replace(/^-+|-+$/g, "");
runtime.selectResponses.push(
	"Manage harnesses",
	"Duplicate harness",
	"strict-coder",
	"Save only",
);
runtime.inputResponses.push(safeCopyName);
runtime.confirmResponses.push(true);
await runtime.commands.get("factory").handler("", runtime.ctx);
assert.equal(runtime.selects.at(-2).title, "Duplicate source harness");
assert.match(
	runtime.notifications.at(-1).message,
	/Duplicated harness profile/,
);

runtime.selectResponses.push(
	"Manage harnesses",
	"Edit project harness",
	safeCopyId,
	"Minimal edits — small targeted changes only",
	"Always — run lint/typecheck/test when available",
	"Balanced — protect secrets and destructive operations",
	"Plan then act — state a concise plan before edits",
	"Concise summary — changed files and validation results",
);
runtime.confirmResponses.push(true);
await runtime.commands.get("factory").handler("", runtime.ctx);
assert.equal(runtime.selects.at(-6).title, "Edit project harness");
assert.match(runtime.notifications.at(-1).message, /Updated harness profile/);

const exportPath = `.pi/harness-factory/${safeCopyId}.export.json`;
runtime.selectResponses.push(
	"Manage harnesses",
	"Import / Export",
	"Export harness",
	safeCopyId,
);
runtime.inputResponses.push(exportPath);
runtime.confirmResponses.push(true);
await runtime.commands.get("factory").handler("", runtime.ctx);
assert.equal(runtime.selects.at(-2).title, "Import / Export");
assert.match(runtime.notifications.at(-1).message, /Exported harness profile/);
assert.equal(existsSync(exportPath), true);

runtime.selectResponses.push(
	"Manage harnesses",
	"Import / Export",
	"Import harness",
);
runtime.inputResponses.push(exportPath);
runtime.confirmResponses.push(true);
await runtime.commands.get("factory").handler("", runtime.ctx);
assert.match(
	runtime.notifications.at(-1).message,
	/Imported harness profile|Profile already exists/,
);

runtime.confirmResponses.length = 0;
runtime.selectResponses.push(
	"Manage harnesses",
	"Delete project harness",
	safeCopyId,
);
runtime.confirmResponses.push(false);
const deleteSelectCountBefore = runtime.selects.length;
await runtime.commands.get("factory").handler("", runtime.ctx);
const deleteSelects = runtime.selects.slice(deleteSelectCountBefore);
assert.equal(deleteSelects.at(0).title, "Harness Factory");
assert.equal(deleteSelects.at(1).title, "Manage harnesses");
assert.equal(deleteSelects.at(2).title, "Delete project harness");
assert.match(runtime.notifications.at(-1).message, /Delete cancelled/);

await runtime.commands.get("factory").handler("list", runtime.ctx);
assert.match(runtime.notifications.at(-1).message, /Harness cards/);
assert.match(runtime.notifications.at(-1).message, /\/factory/);

await runtime.commands.get("factory").handler("browse", runtime.ctx);
assert.equal(
	runtime.customComponents.at(-1) instanceof HarnessGalleryDemo,
	true,
);
assert.match(
	runtime.customComponents.at(-1).render(80).join("\n"),
	/Harness Factory · Select a harness/,
);

runtime.selectResponses.push(
	"Coder — implements code changes",
	"Strict TDD — test-first, strict structure, full validation",
	"Minimal edits — small targeted changes only",
	"Test-first — add/update tests before implementation when feasible",
	"Strict — confirm secrets, deletes, git push, dangerous commands",
	"Plan then act — state a concise plan before edits",
	"Concise summary — changed files and validation results",
	"Save only",
);
const generatedHarnessName = `Generated Test Coder ${process.pid}`;
runtime.inputResponses.push(generatedHarnessName);
runtime.confirmResponses.push(true);
await runtime.commands.get("factory").handler("create", runtime.ctx);
assert.equal(runtime.selects.at(-8).title, "What kind of harness?");
assert.equal(runtime.selects.at(-7).title, "Coder harness preset");
assert.equal(runtime.selects.at(-1).title, "Save generated harness?");
assert.match(runtime.notifications.at(-1).message, /Created harness profile/);

runtime.selectResponses.push("strict-coder", "Preview full policy");
await runtime.commands.get("factory").handler("pick", runtime.ctx);
assert.equal(runtime.selects.at(-2).title, "Pick a harness");
assert.equal(runtime.selects.at(-1).title, "strict coder selected");
assert.match(runtime.notifications.at(-1).message, /Persona:/);

runtime.selectResponses.push("strict-coder", "Activate");
await runtime.commands.get("factory").handler("pick", runtime.ctx);
assert.deepEqual(runtime.statuses.at(-1), {
	key: "harness-factory",
	value: "STRICT-CODER",
});
assert.match(
	runtime.notifications.at(-1).message,
	/Activated harness: strict coder/,
);

await runtime.commands.get("factory").handler("demo-wizard", runtime.ctx);
assert.equal(runtime.selects.at(-1).title, "Factory wizard demo");
assert.match(runtime.notifications.at(-1).message, /Wizard demo selected/);

await runtime.commands.get("factory").handler("demo-tui", runtime.ctx);
assert.equal(
	runtime.customComponents.at(-1) instanceof HarnessGalleryDemo,
	true,
);
assert.match(
	runtime.customComponents.at(-1).render(80).join("\n"),
	/Harness Factory · Select a harness/,
);

await runtime.commands.get("factory").handler("use strict-coder", runtime.ctx);
assert.deepEqual(runtime.statuses.at(-1), {
	key: "harness-factory",
	value: "STRICT-CODER",
});
assert.match(
	runtime.notifications.at(-1).message,
	/Activated harness: strict coder/,
);

const promptPatch = await runtime.hooks.get("before_agent_start")({
	systemPrompt: "Base prompt",
});
assert.match(promptPatch.systemPrompt, /Base prompt/);
assert.match(promptPatch.systemPrompt, /strict coder \(strict-coder\)/);

const blockedDelete = await runtime.hooks.get("tool_call")(
	{ toolName: "bash", input: { command: "git push origin main" } },
	runtime.ctx,
);
assert.deepEqual(blockedDelete, {
	block: true,
	reason: "Blocked command requiring confirmation: git push",
});
assert.match(runtime.confirmations.at(-1).message, /git push origin main/);

const blockedSecret = await runtime.hooks.get("tool_call")(
	{ toolName: "read", input: { path: ".env" } },
	runtime.ctx,
);
assert.deepEqual(blockedSecret, {
	block: true,
	reason: "Sensitive file access denied by user",
});

console.log("harness-factory enforcement tests passed");
