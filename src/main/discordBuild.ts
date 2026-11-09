/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { BrowserWindow, session } from "electron";
import { sleep } from "shared/utils/sleep";

import { DATA_DIR } from "./constants";
import { Settings } from "./settings";

const BUILDS_DIR = join(DATA_DIR, "discordBuilds");
const MAX_SAVED_BUILDS = 10;
const DOWNLOAD_CONCURRENCY = 8;

const BRANCH_HOSTS = ["discord.com", "canary.discord.com", "ptb.discord.com"];
const ASSET_PATH = /^\/assets\/([\w.-]+)$/;

const CONTENT_TYPES: Record<string, string> = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".lottie": "application/zip",
    ".webm": "video/webm"
};

export interface SavedDiscordBuild {
    build: string;
    savedAt: number;
}

export interface AssetDownloadStatus {
    build: string;
    done: number;
    total: number;
    failed: number;
    running: boolean;
}

function branchHost() {
    const branch = Settings.store.discordBranch;
    return branch === "canary" || branch === "ptb" ? `${branch}.discord.com` : "discord.com";
}

const branchDir = () => join(BUILDS_DIR, Settings.store.discordBranch);
const assetsDir = (build: string) => join(branchDir(), build);

export function getSavedBuilds(): SavedDiscordBuild[] {
    let files: string[];
    try {
        files = readdirSync(branchDir());
    } catch {
        return [];
    }

    return files
        .filter(f => /^\d+\.html$/.test(f))
        .map(f => ({ build: f.slice(0, -5), savedAt: statSync(join(branchDir(), f)).mtimeMs }))
        .sort((a, b) => Number(b.build) - Number(a.build));
}

function readPinnedHtml() {
    const build = Settings.store.pinnedDiscordBuild;
    if (!build) return null;

    try {
        return readFileSync(join(branchDir(), `${build}.html`), "utf-8");
    } catch {
        console.warn(`Pinned Discord build ${build} is not saved for ${Settings.store.discordBranch}, loading latest`);
        return null;
    }
}

export async function saveLatestBuild() {
    try {
        const res = await session.defaultSession.fetch(`https://${branchHost()}/app`);
        if (!res.ok) return;

        const html = await res.text();
        const build = html.match(/"BUILD_NUMBER":"(\d+)"/)?.[1];
        if (!build) return;

        const saved = getSavedBuilds();
        if (saved.some(b => b.build === build)) return;

        mkdirSync(branchDir(), { recursive: true });
        await writeFile(join(branchDir(), `${build}.html`), html);

        const stale = [{ build, savedAt: 0 }, ...saved]
            .sort((a, b) => Number(b.build) - Number(a.build))
            .slice(MAX_SAVED_BUILDS)
            .filter(b => b.build !== Settings.store.pinnedDiscordBuild);
        await Promise.all(
            stale.flatMap(b => [
                rm(join(branchDir(), `${b.build}.html`), { force: true }),
                rm(assetsDir(b.build), { recursive: true, force: true })
            ])
        );
    } catch (err) {
        console.error("Failed to save Discord build:", err);
    }
}

function findAssetFiles(code: string) {
    const files = new Set<string>();

    for (const [, map, ext] of code.matchAll(/""\+\(\{([^}]*)\}\)\[\w\]\+"\.(js|css)"/g))
        for (const [, hash] of map.matchAll(/[\d.e]+:"([0-9a-f]+)"/g)) files.add(`${hash}.${ext}`);

    // ids can be minified, e.g. 592e3 for 592000
    for (const [, id, hash, ext] of code.matchAll(/(\d[\d.e]*)===\w\)return""\+\w\+"\.([0-9a-f]+)\.(js|css)"/g))
        files.add(`${Number(id)}.${hash}.${ext}`);

    for (const [, name] of code.matchAll(/"(?:\/assets\/)?((?:[\w-]+\.)?[0-9a-f]{16,}(?:\.module)?\.\w+)"/g))
        files.add(name);
    for (const [, name] of code.matchAll(/url\(["']?\/assets\/([\w.-]+)["']?\)/g)) files.add(name);
    for (const [, hash] of code.matchAll(/\.v\(\w+,\w+\.id,"([0-9a-f]{16,})"/g)) files.add(`${hash}.module.wasm`);

    return files;
}

const assetDownload: AssetDownloadStatus = { build: "", done: 0, total: 0, failed: 0, running: false };
let downloadGeneration = 0;

export const getAssetDownloadStatus = () => assetDownload;

async function fetchAsset(name: string) {
    for (let attempt = 1; attempt <= 5; attempt++) {
        const res = await session.defaultSession.fetch(`https://${branchHost()}/assets/${name}`);
        if (res.status === 429) {
            await sleep(2000 * attempt);
            continue;
        }
        if (res.status === 404) return "missing";
        return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    }
    return null;
}

function removeUnusedAssets(keep: string | undefined) {
    let entries: string[];
    try {
        entries = readdirSync(branchDir());
    } catch {
        return;
    }

    for (const entry of entries) {
        if (/^\d+$/.test(entry) && entry !== keep)
            rm(join(branchDir(), entry), { recursive: true, force: true }).catch(() => {});
    }
}

async function downloadBuildAssets(build: string, html: string) {
    const generation = ++downloadGeneration;
    const dir = assetsDir(build);
    const doneFile = join(dir, ".done");
    mkdirSync(dir, { recursive: true });

    if (existsSync(doneFile)) {
        const total = Number(readFileSync(doneFile, "utf-8")) || 0;
        Object.assign(assetDownload, { build, done: total, total, failed: 0, running: false });
        return;
    }

    const queue = [...new Set(Array.from(html.matchAll(/\/assets\/([\w.-]+\.\w+)/g), m => m[1]))];
    const seen = new Set(queue);
    let missing = 0;
    Object.assign(assetDownload, { build, done: 0, total: queue.length, failed: 0, running: true });

    const getAsset = async (name: string) => {
        const file = join(dir, name);
        if (existsSync(file)) return readFile(file);

        const data = await fetchAsset(name);
        if (data === "missing") {
            missing++;
            return null;
        }
        if (data) {
            await writeFile(`${file}.part`, data);
            await rename(`${file}.part`, file);
        }
        return data;
    };

    const worker = async () => {
        while (queue.length && generation === downloadGeneration) {
            const name = queue.shift()!;
            try {
                const data = await getAsset(name);
                if (!data) assetDownload.failed++;
                else if (/\.(js|css)$/.test(name)) {
                    for (const file of findAssetFiles(data.toString("utf-8"))) {
                        if (seen.has(file)) continue;
                        seen.add(file);
                        queue.push(file);
                        assetDownload.total++;
                    }
                }
            } catch (err) {
                assetDownload.failed++;
                console.error(`Failed to download Discord asset ${name}:`, err);
            }
            assetDownload.done++;
        }
    };

    while (queue.length && generation === downloadGeneration)
        await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));
    if (generation !== downloadGeneration) return;

    assetDownload.running = false;
    if (assetDownload.failed)
        console.warn(`Could not download ${assetDownload.failed} assets of Discord build ${build}`);
    if (assetDownload.failed === missing) await writeFile(doneFile, String(assetDownload.total));
}

function syncAssetDownload() {
    const build = Settings.store.discordBuildAssets ? Settings.store.pinnedDiscordBuild : undefined;
    removeUnusedAssets(build);

    if (!build) {
        downloadGeneration++;
        assetDownload.running = false;
        return;
    }
    if (assetDownload.running && assetDownload.build === build) return;

    const html = readPinnedHtml();
    if (html) downloadBuildAssets(build, html);
}

async function fulfill(
    dbg: Electron.Debugger,
    requestId: string,
    headers: { name: string; value: string }[],
    body: Buffer
) {
    await dbg.sendCommand("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: headers,
        body: body.toString("base64")
    });
}

async function serveAsset(dbg: Electron.Debugger, requestId: string, build: string, pathname: string) {
    const name = pathname.match(ASSET_PATH)?.[1];
    const data = name && (await readFile(join(assetsDir(build), name)).catch(() => null));
    if (!data) return false;

    const type = CONTENT_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream";
    await fulfill(dbg, requestId, [{ name: "Content-Type", value: type }], data);
    return true;
}

async function servePinnedHtml(dbg: Electron.Debugger, requestId: string, responseHeaders: any[]) {
    const pinned = readPinnedHtml();
    if (!pinned) return false;

    const { body, base64Encoded } = await dbg.sendCommand("Fetch.getResponseBody", { requestId });
    const live = base64Encoded ? Buffer.from(body, "base64").toString() : body;
    if (!live.includes("window.GLOBAL_ENV")) return false;

    const csp = responseHeaders.find(h => h.name.toLowerCase() === "content-security-policy");
    const nonce = csp?.value.match(/'nonce-([^']+)'/)?.[1];
    const html = nonce ? pinned.replace(/nonce="[^"]*"/g, () => `nonce="${nonce}"`) : pinned;
    const headers = responseHeaders.filter(h => !["content-length", "content-encoding"].includes(h.name.toLowerCase()));

    await fulfill(dbg, requestId, headers, Buffer.from(html));
    return true;
}

async function onRequestPaused(dbg: Electron.Debugger, params: any) {
    const { requestId, request, responseStatusCode, responseErrorReason, responseHeaders = [] } = params;
    const build = Settings.store.pinnedDiscordBuild;
    const { hostname, pathname } = new URL(request.url);

    try {
        if (build && hostname === branchHost()) {
            const isRequestStage = responseStatusCode == null && responseErrorReason == null;
            const served = isRequestStage
                ? await serveAsset(dbg, requestId, build, pathname)
                : responseStatusCode === 200 && (await servePinnedHtml(dbg, requestId, responseHeaders));
            if (served) return;
        }
    } catch (err) {
        console.error("Failed to serve pinned Discord build:", err);
    }

    dbg.sendCommand("Fetch.continueRequest", { requestId }).catch(() => {});
}

const initializedWindows = new WeakSet<BrowserWindow>();

export async function applyBuildPin(win: BrowserWindow) {
    const dbg = win.webContents.debugger;

    if (!initializedWindows.has(win)) {
        initializedWindows.add(win);
        dbg.on("message", (_e, method, params) => {
            if (method === "Fetch.requestPaused") onRequestPaused(dbg, params);
        });

        session.defaultSession.webRequest.onBeforeRequest(
            { urls: BRANCH_HOSTS.map(h => `https://${h}/assets/version.*`) },
            (_details, cb) => cb({ cancel: !!Settings.store.pinnedDiscordBuild })
        );
    }

    syncAssetDownload();

    try {
        if (Settings.store.pinnedDiscordBuild) {
            const patterns: object[] = BRANCH_HOSTS.map(h => ({
                urlPattern: `https://${h}/*`,
                resourceType: "Document",
                requestStage: "Response"
            }));
            if (Settings.store.discordBuildAssets)
                patterns.push(
                    ...BRANCH_HOSTS.map(h => ({ urlPattern: `https://${h}/assets/*`, requestStage: "Request" }))
                );

            if (!dbg.isAttached()) dbg.attach("1.3");
            await dbg.sendCommand("Fetch.enable", { patterns });
        } else if (dbg.isAttached()) {
            await dbg.sendCommand("Fetch.disable");
        }
    } catch (err) {
        console.error("Failed to apply Discord build pin:", err);
    }
}
