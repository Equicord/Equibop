/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChildProcess, spawn } from "child_process";
import { app } from "electron";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { IpcEvents } from "shared/IpcEvents";

import { mainWin } from "../mainWindow";
import { Settings } from "../settings";

interface ArRPCStreamerModeMessage {
    type: "STREAMERMODE";
    data: string;
}

interface ArRPCServerInfoMessage {
    type: "SERVER_INFO";
    data: {
        port: number;
        host: string;
    };
}

type ArRPCMessage = ArRPCStreamerModeMessage | ArRPCServerInfoMessage;

function isArRPCMessage(message: unknown): message is ArRPCMessage {
    return (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        (message.type === "STREAMERMODE" || message.type === "SERVER_INFO")
    );
}

function debugLog(...args: any[]) {
    if (Settings.store.arRPCDebug) {
        console.log("[arRPC > debug]", ...args);
    }
}

function getBundledBunPath(): string {
    const { platform } = process;
    const { arch } = process;

    let bunBinary = "bun";
    if (platform === "win32") bunBinary = "bun.exe";

    const bunPlatform = platform === "win32" ? "windows" : platform;
    const bunArch = arch === "arm64" ? "aarch64" : "x64";

    debugLog(`Looking for bun binary for platform=${platform}, arch=${arch}`);

    const possiblePaths = [
        // packaged app with resourcesPath
        process.resourcesPath
            ? join(process.resourcesPath, "bun", `${platform}-${arch}`, `bun-${bunPlatform}-${bunArch}`, bunBinary)
            : null,
        // system Electron (AUR, etc) - app.asar is in the resources directory
        join(app.getAppPath(), "..", "bun", `${platform}-${arch}`, `bun-${bunPlatform}-${bunArch}`, bunBinary),
        // development or alternative structure
        join(app.getAppPath(), "bun", `${platform}-${arch}`, `bun-${bunPlatform}-${bunArch}`, bunBinary)
    ].filter(Boolean);

    debugLog("Checking possible bun paths:", possiblePaths);

    for (const bunPath of possiblePaths) {
        if (bunPath && existsSync(bunPath)) {
            debugLog(`Found bun binary at: ${bunPath}`);
            return bunPath;
        }
    }

    debugLog("No bundled bun found, falling back to system bun");
    // fallback to system bun
    return "bun";
}

let bunProcess: ChildProcess;
let lastError: string | null = null;
let lastExitCode: number | null = null;
let serverPort: number | null = null;
let serverHost: string | null = null;
let startTime: number | null = null;
let restartCount: number = 0;
let bunPath: string | null = null;
let warnings: string[] = [];

export function getArRPCStatus() {
    return {
        running: bunProcess?.pid != null,
        pid: bunProcess?.pid ?? null,
        port: serverPort,
        host: serverHost,
        enabled: Settings.store.arRPC ?? false,
        lastError,
        lastExitCode,
        uptime: startTime ? Date.now() - startTime : null,
        restartCount,
        bunPath,
        warnings: [...warnings]
    };
}

export function destroyArRPC() {
    if (!bunProcess) return;

    debugLog("Destroying arRPC process");
    bunProcess.kill();
    bunProcess = null as any;
    serverPort = null;
    serverHost = null;
    startTime = null;
}

export async function restartArRPC() {
    debugLog("Restarting arRPC");
    restartCount++;
    destroyArRPC();
    await new Promise(resolve => setTimeout(resolve, 500));
    await initArRPC();
}

export async function initArRPC() {
    if (!Settings.store.arRPC) {
        debugLog("arRPC is disabled in settings, destroying if running");
        destroyArRPC();
        return;
    }

    if (bunProcess) {
        debugLog("arRPC process already running");
        return;
    }

    warnings = [];
    lastError = null;
    lastExitCode = null;

    try {
        // check for unpacked version first (for production builds)
        const workerPath = resolve(__dirname, "./arrpc/bunWorker.js").replace("app.asar", "app.asar.unpacked");
        const resolvedBunPath = getBundledBunPath();

        debugLog("Initializing arRPC");
        debugLog(`Worker path: ${workerPath}`);
        debugLog(`Bun path: ${resolvedBunPath}`);
        debugLog(`Spawn args: [${workerPath}]`);

        if (resolvedBunPath === "bun") {
            warnings.push("Using system bun (bundled bun not found)");
        }

        bunProcess = spawn(resolvedBunPath, [workerPath], {
            stdio: ["ignore", "pipe", "pipe", "ipc"],
            env: process.env,
            windowsHide: true
        });

        debugLog(`arRPC process spawned with PID: ${bunProcess.pid}`);

        bunPath = resolvedBunPath;
        startTime = Date.now();

        bunProcess.on("message", message => {
            debugLog("Received IPC message from bunWorker:", message);
            if (isArRPCMessage(message)) {
                if (message.type === "SERVER_INFO") {
                    serverPort = message.data.port;
                    serverHost = message.data.host;
                    debugLog(`arRPC server listening on ${serverHost}:${serverPort}`);
                } else if (message.type === "STREAMERMODE") {
                    debugLog("Message is STREAMERMODE, sending to renderer");
                    mainWin?.webContents.send(IpcEvents.STREAMER_MODE_DETECTED, message.data);
                }
            }
        });

        bunProcess.stdout?.on("data", data => {
            console.log(data.toString().trim());
        });

        bunProcess.stderr?.on("data", data => {
            const errorMsg = data.toString().trim();
            console.error("[arRPC ! stderr]", errorMsg);
            lastError = errorMsg;
        });

        bunProcess.on("error", err => {
            console.error("[arRPC] Failed to start:", err);
            lastError = err.message;
        });

        bunProcess.on("exit", code => {
            lastExitCode = code;
            if (code !== 0 && code !== null) {
                console.error(`[arRPC] Process exited with code ${code}`);
            }
            debugLog(`arRPC process exited with code ${code}`);
            bunProcess = null as any;
            startTime = null;
        });
    } catch (e) {
        console.error("Failed to start arRPC server", e);
        lastError = e instanceof Error ? e.message : String(e);
    }
}

Settings.addChangeListener("arRPC", initArRPC);
