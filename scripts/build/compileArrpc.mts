import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join, parse } from "path";

const OUTPUT_DIR = join(import.meta.dir, "..", "..", "static/dist");
const ARRPC_DIR = join(import.meta.dir, "..", "..", "node_modules/arrpc-bun");
const ARRPC_ENTRY = join(ARRPC_DIR, "src/index.ts");

interface CompileTarget {
	platform: string;
	arch: string;
	target: string;
	output: string;
}

const TARGETS: CompileTarget[] = [
	{
		platform: "linux",
		arch: "x64",
		target: "bun-linux-x64-baseline",
		output: "arrpc-linux-x64"
	},
	{
		platform: "linux",
		arch: "arm64",
		target: "bun-linux-arm64",
		output: "arrpc-linux-arm64"
	},
	{
		platform: "darwin",
		arch: "x64",
		target: "bun-darwin-x64-baseline",
		output: "arrpc-darwin-x64"
	},
	{
		platform: "darwin",
		arch: "arm64",
		target: "bun-darwin-arm64",
		output: "arrpc-darwin-arm64"
	},
	{
		platform: "windows",
		arch: "x64",
		target: "bun-windows-x64-baseline",
		output: "arrpc-windows-x64.exe"
	}
];

if (!existsSync(ARRPC_DIR)) {
	console.error("Error: arrpc-bun not found in node_modules");
	console.error("Run 'bun install' first");
	process.exit(1);
}

if (!existsSync(ARRPC_ENTRY)) {
	console.error(`Error: arrpc-bun entry point not found at ${ARRPC_ENTRY}`);
	process.exit(1);
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const currentPlatform = process.platform === "win32" ? "windows" : process.platform;
const currentArch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch;

let targetsToCompile = TARGETS;
if (isCI) {
	targetsToCompile = TARGETS.filter(t => t.platform === currentPlatform);
	console.log(`Running in CI on ${currentPlatform}, compiling only for current platform...`);
} else if (currentPlatform === "darwin") {
	targetsToCompile = TARGETS.filter(t => t.platform === currentPlatform);
	console.log(`Compiling arRPC binaries for macOS universal build: x64 and arm64`);
} else {
	targetsToCompile = TARGETS.filter(t => t.platform === currentPlatform && t.arch === currentArch);
	console.log(`Compiling arRPC binary for current machine: ${currentPlatform}-${currentArch}`);
}

console.log(`Source: ${ARRPC_ENTRY}`);
console.log(`Output: ${OUTPUT_DIR}\n`);

const compiledTargets: string[] = [];
const failedTargets: string[] = [];

for (const target of targetsToCompile) {
	const outputPath = join(OUTPUT_DIR, target.output);

	console.log(`Compiling ${target.platform}-${target.arch}...`);
	console.log(`  Target: ${target.target}`);
	console.log(`  Output: ${outputPath}`);

	try {
		const cmd = `bun build ${ARRPC_ENTRY} --compile --target=${target.target} --outfile=${outputPath}`;
		const env = { ...process.env };
		// see https://github.com/oven-sh/bun/issues/28327.
		if (currentPlatform === "windows") {
			env.BUN_INSTALL = join(parse(ARRPC_DIR).root, ".bun-compile");
		}
		// see https://github.com/oven-sh/bun/issues/29120.
		if (target.platform === "darwin") {
			env.BUN_NO_CODESIGN_MACHO_BINARY = "1";
		}
		execSync(cmd, {
			stdio: "inherit",
			cwd: ARRPC_DIR,
			env
		});

		console.log(`Compiled ${target.output}\n`);
		compiledTargets.push(target.output);
	} catch (err) {
		console.error(`Failed to compile ${target.output}`);
		console.error(err);
		failedTargets.push(target.output);

		if (isCI) {
			console.error(`Compilation failed in CI for ${target.output}`);
			process.exit(1);
		} else {
			console.warn(`Skipping ${target.output}, continuing with other targets...\n`);
		}
	}
}

if (compiledTargets.length === 0) {
	console.error("No binaries were compiled successfully!");
	process.exit(1);
}

if (failedTargets.length > 0 && !isCI) {
	console.warn(`\nWarning: ${failedTargets.length} target(s) failed to compile:`);
	failedTargets.forEach(t => console.warn(`  - ${t}`));
	console.warn("Continuing with successfully compiled binaries...\n");
}

console.log(`\n Successfully compiled ${compiledTargets.length} arRPC ${compiledTargets.length === 1 ? "binary" : "binaries"}!`);
