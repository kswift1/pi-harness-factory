import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
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

console.log("harness-factory enforcement tests passed");
