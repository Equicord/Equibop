/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execSync } from "child_process";
import { BuildContext, BuildOptions, context } from "esbuild";
import { copyFile } from "fs/promises";

import vencordDep from "./vencordDep.mjs";
import { includeDirPlugin } from "./includeDirPlugin.mts";

const isDev = process.argv.includes("--dev");

let gitHash: string;
try {
    gitHash = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
} catch {
    gitHash = process.env.FLATPAK_BUILDER_BUILDDIR ? "flatpak" : "unknown";
}

const CommonOpts: BuildOptions = {
    minify: !isDev,
    bundle: true,
    sourcemap: "linked",
    logLevel: "info"
};

const NodeCommonOpts: BuildOptions = {
    ...CommonOpts,
    format: "cjs",
    platform: "node",
    external: ["electron", "original-fs"],
    target: ["esnext"],
    loader: {
        ".node": "file"
    },
    define: {
        IS_DEV: JSON.stringify(isDev),
        EQUIBOP_GIT_HASH: JSON.stringify(gitHash)
    }
};

const contexts = [] as BuildContext[];
async function createContext(options: BuildOptions) {
    contexts.push(await context(options));
}

async function copyVenmic() {
    if (process.platform !== "linux") return;

    return Promise.all([
        copyFile(
            "./node_modules/@vencord/venmic/prebuilds/venmic-addon-linux-x64/node-napi-v7.node",
            "./static/dist/venmic-x64.node"
        ),
        copyFile(
            "./node_modules/@vencord/venmic/prebuilds/venmic-addon-linux-arm64/node-napi-v7.node",
            "./static/dist/venmic-arm64.node"
        )
    ]).catch(() => console.warn("Failed to copy venmic. Building without venmic support"));
}

async function copyLibVesktop() {
    if (process.platform !== "linux") return;

    try {
        await copyFile(
            "./packages/libvesktop/build/Release/vesktop.node",
            `./static/dist/libvesktop-${process.arch}.node`
        );
        console.log("Using local libvesktop build");
    } catch {
        console.log(
            "Using prebuilt libvesktop binaries. Run `bun buildLibVesktop` and build again to build from source - see README.md for more details"
        );
        return Promise.all([
            copyFile("./packages/libvesktop/prebuilds/vesktop-x64.node", "./static/dist/libvesktop-x64.node"),
            copyFile("./packages/libvesktop/prebuilds/vesktop-arm64.node", "./static/dist/libvesktop-arm64.node")
        ]).catch(() => console.warn("Failed to copy libvesktop. Building without libvesktop support"));
    }
}

await Promise.all([
    copyVenmic(),
    copyLibVesktop(),
    createContext({
        ...NodeCommonOpts,
        entryPoints: ["src/main/index.ts"],
        outfile: "dist/js/main.js",
        footer: { js: "//# sourceURL=VesktopMain" }
    }),
    createContext({
        ...NodeCommonOpts,
        entryPoints: ["src/preload/index.ts"],
        outfile: "dist/js/preload.js",
        footer: { js: "//# sourceURL=VesktopPreload" }
    }),
    createContext({
        ...NodeCommonOpts,
        entryPoints: ["src/preload/splash.ts"],
        outfile: "dist/js/splashPreload.js",
        footer: { js: "//# sourceURL=VesktopSplashPreload" }
    }),
    createContext({
        ...NodeCommonOpts,
        entryPoints: ["src/preload/updater.ts"],
        outfile: "dist/js/updaterPreload.js",
        footer: { js: "//# sourceURL=VesktopUpdaterPreload" }
    }),
    createContext({
        ...CommonOpts,
        globalName: "Equibop",
        entryPoints: ["src/renderer/index.ts"],
        outfile: "dist/js/renderer.js",
        format: "iife",
        inject: ["./scripts/build/injectReact.mjs"],
        jsxFactory: "VencordCreateElement",
        jsxFragment: "VencordFragment",
        external: ["@equicord/types/*"],
        plugins: [vencordDep, includeDirPlugin("patches", "src/renderer/patches")],
        footer: { js: "//# sourceURL=VesktopRenderer" }
    })
]);

const watch = process.argv.includes("--watch");

if (watch) {
	await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
	const results = await Promise.all(
		contexts.map(async (ctx) => {
			const result = await ctx.rebuild();
			await ctx.dispose();
			return result;
		}),
	);

	for (const result of results) {
		if (result.metafile) {
			const outputs = Object.keys(result.metafile.outputs);
			for (const output of outputs) {
				const meta = result.metafile.outputs[output];
				const size = (meta.bytes / 1024).toFixed(2);
				console.log(`  ${output} ${size} KB`);
			}
		}
	}
}
