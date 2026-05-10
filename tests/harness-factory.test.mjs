import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import registerHarnessFactory, {
	buildHarnessInstructions,
	commandRequiresConfirmation,
	isSensitivePath,
} from "../.tmp-test/extensions/index.js";

const strictProfile = JSON.parse(
	readFileSync(".pi/harness-factory/profiles/strict-coder.json", "utf8"),
);

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
				return false;
			},
		},
	};
	registerHarnessFactory(pi);
	return { commands, hooks, notifications, statuses, confirmations, ctx };
}

const runtime = createRuntimeHarness();
assert.equal(runtime.commands.has("factory"), true);
assert.equal(runtime.commands.has("facory"), true);
assert.equal(runtime.hooks.has("session_start"), true);
assert.equal(runtime.hooks.has("before_agent_start"), true);
assert.equal(runtime.hooks.has("tool_call"), true);

await runtime.commands.get("factory").handler("list", runtime.ctx);
assert.match(runtime.notifications.at(-1).message, /strict-coder/);

await runtime.commands.get("factory").handler("use strict-coder", runtime.ctx);
assert.deepEqual(runtime.statuses.at(-1), {
	key: "harness-factory",
	value: "STRICT-CODER",
});
assert.match(runtime.notifications.at(-1).message, /Activated harness: strict coder/);

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
