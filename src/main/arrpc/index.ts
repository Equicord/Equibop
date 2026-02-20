/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChildProcess, spawn } from "child_process";
import { accessSync, constants, existsSync, FSWatcher, readFileSync, statSync, watch } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { IpcEvents } from "shared/IpcEvents";
import { STATIC_DIR } from "shared/paths";
import { WebSocket } from "ws";

import { mainWin } from "../mainWindow";
import { Settings } from "../settings";

const STATE_FILE_PREFIX = "arrpc-state";
const STATE_FILE_MAX_INDEX = 9;

interface StateFileContent {
    appVersion: string;
    timestamp: number;
    servers: {
        bridge?: { port: number; host: string };
        websocket?: { port: number; host: string };
        ipc?: { socketPath: string };
    };
    activities: Array<{
        socketId: string;
        name: string;
        applicationId: string;
        pid: number;
        startTime: number | null;
    }>;
}

function debugLog(...args: any[]) {
    if (Settings.store.arRPCDebug) {
        console.log("[arRPC > debug]", ...args);
    }
}

const SUPPORTED_PLATFORMS = new Map([
    ["linux", ["x64", "arm64"]],
    ["darwin", ["x64", "arm64"]],
    ["win32", ["x64"]]
]);

function validatePlatform(): void {
    const { platform, arch } = process;
    const supportedArchs = SUPPORTED_PLATFORMS.get(platform);

    if (!supportedArchs) {
        throw new Error(
            `Unsupported platform: ${platform}. arRPC only supports: ${Array.from(SUPPORTED_PLATFORMS.keys()).join(", ")}`
        );
    }

    if (!supportedArchs.includes(arch)) {
        throw new Error(`Unsupported architecture for ${platform}: ${arch}. Supported: ${supportedArchs.join(", ")}`);
    }
}

function getArRPCBinaryPath(): string {
    validatePlatform();

    const { platform } = process;
    const { arch } = process;

    debugLog(`Looking for arRPC binary for platform=${platform}, arch=${arch}`);

    const checkBinary = (path: string): boolean => {
        if (path.includes(".asar")) return false;
        if (!existsSync(path)) return false;

        const stats = statSync(path);
        if (!stats.isFile()) {
            debugLog(`Path exists but is not a file: ${path}`);
            return false;
        }

        try {
            accessSync(path, constants.X_OK);
            return true;
        } catch {
            if (platform !== "win32") {
                debugLog(`Binary not executable: ${path}`);
                return false;
            }
            return true;
        }
    };

    const platformName = platform === "win32" ? "windows" : platform;
    const archName = arch === "arm64" ? "arm64" : "x64";
    const devBinaryName = `arrpc-${platformName}-${archName}${platform === "win32" ? ".exe" : ""}`;
    const packagedBinaryName = platform === "win32" ? "arrpc.exe" : "arrpc";

    const searchPaths: string[] = [];

    if (platform === "linux") {
        searchPaths.push("/usr/bin/arrpc-bun");
        searchPaths.push("/usr/local/bin/arrpc-bun");
        searchPaths.push("/app/bin/arrpc-bun");
        searchPaths.push("/snap/bin/arrpc-bun");
        const homeDir = process.env.HOME;
        if (homeDir) {
            searchPaths.push(join(homeDir, ".nix-profile/bin/arrpc-bun"));
            searchPaths.push(join(homeDir, ".local/bin/arrpc-bun"));
        }
        searchPaths.push("/home/linuxbrew/.linuxbrew/bin/arrpc-bun");
    } else if (platform === "darwin") {
        searchPaths.push("/usr/local/bin/arrpc-bun");
        searchPaths.push("/opt/homebrew/bin/arrpc-bun");
        const homeDir = process.env.HOME;
        if (homeDir) {
            searchPaths.push(join(homeDir, ".nix-profile/bin/arrpc-bun"));
        }
    } else if (platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA;
        const programFiles = process.env.PROGRAMFILES;
        if (localAppData) {
            searchPaths.push(join(localAppData, "arrpc-bun", "arrpc-bun.exe"));
        }
        if (programFiles) {
            searchPaths.push(join(programFiles, "arrpc-bun", "arrpc-bun.exe"));
        }
    }

    if (process.resourcesPath) {
        searchPaths.push(join(process.resourcesPath, "arrpc", packagedBinaryName));
    }

    if (STATIC_DIR.includes(".asar")) {
        const asarParent = join(STATIC_DIR.split(".asar")[0] + ".asar", "..");
        searchPaths.push(join(asarParent, "arrpc", packagedBinaryName));
    }

    searchPaths.push(join(STATIC_DIR, "dist", devBinaryName));

    for (const path of searchPaths) {
        debugLog(`Checking: ${path}`);
        if (checkBinary(path)) {
            debugLog(`Found arRPC binary at: ${path}`);
            return path;
        }
    }

    throw new Error(`arRPC binary not found. Searched: ${searchPaths.join(", ")}`);
}

let arrpcProcess: ChildProcess | null = null;
let lastError: string | null = null;
let lastExitCode: number | null = null;
let serverPort: number | null = null;
let serverHost: string | null = null;
let startTime: number | null = null;
let readyTime: number | null = null;
let restartCount: number = 0;
let binaryPath: string | null = null;
let isReady: boolean = false;
let mainSettingsListener: (() => void) | null = null;
let configSettingsListener: (() => void) | null = null;
let wsSettingsListener: (() => void) | null = null;
let initTimeout: NodeJS.Timeout | null = null;
let isDestroying: boolean = false;
let stateFileWatcher: FSWatcher | null = null;
let stateFilePath: string | null = null;
let stateCheckInterval: NodeJS.Timeout | null = null;
let appVersion: string | null = null;

const INIT_TIMEOUT_MS = 10000;
const PROCESS_KILL_TIMEOUT_MS = 5000;
const STATE_CHECK_INTERVAL_MS = 500;
const STATE_FILE_STALE_MS = 60000;
const WS_RECONNECT_INTERVAL_MS = 5000;

let ws: WebSocket | null = null;
let wsReconnectTimer: NodeJS.Timeout | null = null;
let wsIntentionalClose = false;

function findStateFile(): string | null {
    const tempDir = tmpdir();

    for (let i = 0; i <= STATE_FILE_MAX_INDEX; i++) {
        const path = join(tempDir, `${STATE_FILE_PREFIX}-${i}`);
        if (existsSync(path)) {
            try {
                const content = JSON.parse(readFileSync(path, "utf-8")) as StateFileContent;
                const age = Date.now() - content.timestamp;
                if (age < STATE_FILE_STALE_MS) {
                    return path;
                }
            } catch {
                continue;
            }
        }
    }

    if (arrpcProcess?.pid) {
        const pidPath = join(tempDir, `${STATE_FILE_PREFIX}-${arrpcProcess.pid}`);
        if (existsSync(pidPath)) {
            return pidPath;
        }
    }

    return null;
}

function readStateFile(): StateFileContent | null {
    const path = stateFilePath || findStateFile();
    if (!path) return null;

    try {
        const content = JSON.parse(readFileSync(path, "utf-8")) as StateFileContent;
        const age = Date.now() - content.timestamp;
        if (age > STATE_FILE_STALE_MS) {
            debugLog(`State file is stale (${age}ms old)`);
            return null;
        }
        return content;
    } catch (e) {
        debugLog(`Failed to read state file: ${e}`);
        return null;
    }
}

function handleStateUpdate(state: StateFileContent) {
    if (state.servers.bridge) {
        serverPort = state.servers.bridge.port;
        serverHost = state.servers.bridge.host;
        debugLog(`State file bridge info: ${serverHost}:${serverPort}`);
    }

    if (state.appVersion && state.appVersion !== "unknown") {
        appVersion = state.appVersion;
    }

    if (!isReady && state.timestamp) {
        isReady = true;
        readyTime = Date.now();
        clearInitTimeout();
        debugLog(`arRPC ready (from state file), version: ${state.appVersion}`);
        updateWebSocketConnection();
    }
}

function startStateFileWatching() {
    stopStateFileWatching();

    stateCheckInterval = setInterval(() => {
        const path = findStateFile();
        if (path) {
            stateFilePath = path;
            debugLog(`Found state file: ${path}`);

            const state = readStateFile();
            if (state) {
                handleStateUpdate(state);
            }

            try {
                stateFileWatcher = watch(path, { persistent: false }, () => {
                    const updatedState = readStateFile();
                    if (updatedState) {
                        handleStateUpdate(updatedState);
                    }
                });
                debugLog(`Watching state file: ${path}`);

                if (stateCheckInterval) {
                    clearInterval(stateCheckInterval);
                    stateCheckInterval = null;
                }
            } catch (e) {
                debugLog(`Failed to watch state file, continuing to poll: ${e}`);
            }
        }
    }, STATE_CHECK_INTERVAL_MS);
}

function stopStateFileWatching() {
    if (stateFileWatcher) {
        stateFileWatcher.close();
        stateFileWatcher = null;
    }
    if (stateCheckInterval) {
        clearInterval(stateCheckInterval);
        stateCheckInterval = null;
    }
    stateFilePath = null;
}

interface StateFileResult {
    content: StateFileContent | null;
    stale: boolean;
}

function findAnyStateFile(): StateFileResult {
    const tempDir = tmpdir();

    for (let i = 0; i <= STATE_FILE_MAX_INDEX; i++) {
        const path = join(tempDir, `${STATE_FILE_PREFIX}-${i}`);
        if (existsSync(path)) {
            try {
                const content = JSON.parse(readFileSync(path, "utf-8")) as StateFileContent;
                const age = Date.now() - content.timestamp;
                return { content, stale: age >= STATE_FILE_STALE_MS };
            } catch {
                continue;
            }
        }
    }
    return { content: null, stale: false };
}

function getWsConnectionInfo(): { host: string; port: number } | null {
    const customHost = Settings.store.arRPCWebSocketCustomHost;
    const customPort = Settings.store.arRPCWebSocketCustomPort;

    if (customHost || customPort) {
        return {
            host: customHost || "127.0.0.1",
            port: customPort || 1337
        };
    }

    const state = readStateFile();
    if (state?.servers.bridge) {
        return {
            host: state.servers.bridge.host,
            port: state.servers.bridge.port
        };
    }

    if (serverHost && serverPort) {
        return { host: serverHost, port: serverPort };
    }

    return null;
}

function connectWebSocket() {
    const connectionInfo = getWsConnectionInfo();
    if (!connectionInfo) {
        debugLog("No connection info available for WebSocket");
        return;
    }

    const { host, port } = connectionInfo;
    const wsUrl = `ws://${host}:${port}`;

    debugLog(`Connecting WebSocket to ${wsUrl}`);

    if (ws) {
        wsIntentionalClose = true;
        ws.close();
    }

    ws = new WebSocket(wsUrl);

    ws.on("message", (data: Buffer) => {
        try {
            const message = JSON.parse(data.toString());
            debugLog("Received activity:", message);

            mainWin?.webContents.send(IpcEvents.ARRPC_ACTIVITY, message);
        } catch (e) {
            debugLog("Failed to parse WebSocket message:", e);
        }
    });

    ws.on("error", (err: Error) => {
        debugLog("WebSocket error:", err.message);
    });

    ws.on("close", () => {
        if (wsIntentionalClose) {
            wsIntentionalClose = false;
            return;
        }

        const autoReconnect = Settings.store.arRPCWebSocketAutoReconnect ?? true;
        debugLog(`WebSocket closed${autoReconnect ? ", will reconnect" : ""}`);

        mainWin?.webContents.send(IpcEvents.ARRPC_ACTIVITY, { activity: null });

        if (wsReconnectTimer) clearTimeout(wsReconnectTimer);

        if (autoReconnect && shouldConnectWebSocket()) {
            wsReconnectTimer = setTimeout(() => {
                debugLog("Attempting WebSocket reconnect...");
                connectWebSocket();
            }, WS_RECONNECT_INTERVAL_MS);
        }
    });

    ws.on("open", () => {
        debugLog("WebSocket connected");
        if (wsReconnectTimer) {
            clearTimeout(wsReconnectTimer);
            wsReconnectTimer = null;
        }
    });
}

function stopWebSocket() {
    if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
    }

    if (ws) {
        wsIntentionalClose = true;
        ws.close();
        ws = null;
    }

    mainWin?.webContents.send(IpcEvents.ARRPC_ACTIVITY, { activity: null });
    debugLog("WebSocket stopped");
}

function shouldConnectWebSocket(): boolean {
    if (Settings.store.arRPCDisabled) return false;

    const customHost = Settings.store.arRPCWebSocketCustomHost;
    const customPort = Settings.store.arRPCWebSocketCustomPort;
    if (customHost || customPort) return true;

    if (!Settings.store.arRPC) return false;

    return isReady || arrpcProcess != null;
}

function updateWebSocketConnection() {
    if (shouldConnectWebSocket()) {
        const connectionInfo = getWsConnectionInfo();
        if (connectionInfo) {
            connectWebSocket();
        }
    } else {
        stopWebSocket();
    }
}

export function getArRPCStatus() {
    const proc = arrpcProcess;
    const pid = proc?.pid ?? null;
    const running = proc != null && !proc.killed && pid != null;

    const integratedState = readStateFile();
    const externalResult = !running ? findAnyStateFile() : { content: null, stale: false };
    const state = integratedState || externalResult.content;
    const isStale = !integratedState && externalResult.stale;

    if (state) {
        const isExternal = !running && state !== null;
        return {
            running: running || isExternal,
            pid,
            port: state.servers.bridge?.port ?? serverPort,
            host: state.servers.bridge?.host ?? serverHost,
            enabled: Settings.store.arRPC ?? false,
            lastError,
            lastExitCode,
            uptime: startTime ? Date.now() - startTime : null,
            readyTime: readyTime ? Date.now() - readyTime : null,
            restartCount,
            binaryPath,
            isReady: isReady || (isExternal && !isStale),
            isStale,
            appVersion: state.appVersion,
            activities: state.activities
        };
    }

    return {
        running,
        pid,
        port: serverPort,
        host: serverHost,
        enabled: Settings.store.arRPC ?? false,
        lastError,
        lastExitCode,
        uptime: startTime ? Date.now() - startTime : null,
        readyTime: readyTime ? Date.now() - readyTime : null,
        restartCount,
        binaryPath,
        isReady,
        isStale: false,
        appVersion,
        activities: []
    };
}

function clearInitTimeout() {
    if (initTimeout) {
        clearTimeout(initTimeout);
        initTimeout = null;
    }
}

export async function destroyArRPC(): Promise<void> {
    if (!arrpcProcess || isDestroying) return;

    isDestroying = true;
    debugLog("Destroying arRPC process");

    clearInitTimeout();
    stopStateFileWatching();
    stopWebSocket();

    const proc = arrpcProcess;
    arrpcProcess = null;
    serverPort = null;
    serverHost = null;
    startTime = null;
    readyTime = null;
    isReady = false;
    appVersion = null;

    if (proc) {
        proc.removeAllListeners();
        proc.stdout?.removeAllListeners();
        proc.stderr?.removeAllListeners();

        if (!proc.killed) {
            const killPromise = new Promise<void>(resolve => {
                const timeout = setTimeout(() => {
                    if (!proc.killed) {
                        debugLog("Process did not exit gracefully, force killing");
                        proc.kill("SIGKILL");
                    }
                    resolve();
                }, PROCESS_KILL_TIMEOUT_MS);

                proc.once("exit", () => {
                    clearTimeout(timeout);
                    resolve();
                });

                proc.kill("SIGTERM");
            });

            await killPromise;
        }
    }

    isDestroying = false;
    debugLog("arRPC process destroyed");
}

export async function restartArRPC() {
    debugLog("Restarting arRPC");
    await destroyArRPC();
    await initArRPC();
    if (arrpcProcess) {
        restartCount++;
    }
}

export async function initArRPC() {
    if (Settings.store.arRPCDisabled) {
        debugLog("Rich Presence is disabled");
        await destroyArRPC();
        restartCount = 0;
        return;
    }

    if (!Settings.store.arRPC) {
        debugLog("Built-in server is disabled, using external only");
        await destroyArRPC();
        restartCount = 0;
        return;
    }

    if (arrpcProcess) {
        debugLog("arRPC process already running");
        return;
    }

    lastError = null;
    lastExitCode = null;
    isReady = false;
    appVersion = null;

    try {
        const resolvedBinaryPath = getArRPCBinaryPath();

        debugLog("Initializing arRPC");
        debugLog(`Binary path: ${resolvedBinaryPath}`);

        binaryPath = resolvedBinaryPath;

        const env: NodeJS.ProcessEnv = {
            ...process.env,
            ARRPC_STATE_FILE: "1",
            ARRPC_PARENT_MONITOR: "1"
        };

        if (Settings.store.arRPCDebug) {
            env.ARRPC_DEBUG = "1";
        }

        if (Settings.store.arRPCProcessScanning === false) {
            env.ARRPC_NO_PROCESS_SCANNING = "1";
        }

        if (Settings.store.arRPCBridge === false) {
            env.ARRPC_NO_BRIDGE = "1";
        }

        arrpcProcess = spawn(resolvedBinaryPath, [], {
            stdio: ["ignore", "pipe", "pipe"],
            env,
            windowsHide: true
        });

        debugLog(`arRPC process spawned with PID: ${arrpcProcess.pid}`);
        startTime = Date.now();

        startStateFileWatching();

        initTimeout = setTimeout(() => {
            if (!isReady && arrpcProcess) {
                const error = "arRPC failed to become ready within timeout";
                console.error(`[arRPC] ${error}`);
                lastError = error;
                destroyArRPC();
            }
        }, INIT_TIMEOUT_MS);

        arrpcProcess.stdout?.on("data", data => {
            const output = data.toString().trim();
            if (output) console.log(output);
        });

        arrpcProcess.stderr?.on("data", data => {
            const output = data.toString().trim();
            if (output) {
                try {
                    const message = JSON.parse(output);
                    if (message.type === "STREAMERMODE") {
                        debugLog(`Streamer mode changed: ${message.data}`);
                        mainWin?.webContents.send(IpcEvents.ARRPC_ACTIVITY, JSON.parse(message.data));
                        return;
                    }
                } catch {}
                console.error("[arRPC ! stderr]", output);
                lastError = output;
            }
        });

        arrpcProcess.on("error", err => {
            console.error("[arRPC] Process error:", err);
            lastError = err.message;
            clearInitTimeout();
            stopStateFileWatching();
        });

        arrpcProcess.on("exit", (code, signal) => {
            lastExitCode = code;
            const wasReady = isReady;

            if (code !== 0 && code !== null) {
                console.error(`[arRPC] Process exited with code ${code}, signal ${signal}`);
                lastError = `Process exited with code ${code}`;
            }

            if (signal === "SIGILL") {
                console.error(
                    "[arRPC] SIGILL (Illegal Instruction) - Binary may be compiled for a different CPU architecture"
                );
                console.error(`[arRPC] arch: ${process.arch}, platform: ${process.platform}, binary: ${binaryPath}`);
                lastError = "SIGILL: Binary incompatible with CPU architecture";
            } else if (signal === "SIGSEGV") {
                console.error(`[arRPC] SIGSEGV (Segmentation Fault) - binary: ${binaryPath}`);
                lastError = "SIGSEGV: Binary crashed";
            } else if (signal === "SIGABRT") {
                console.error(`[arRPC] SIGABRT (Abort) - binary: ${binaryPath}`);
                lastError = "SIGABRT: Binary aborted";
            }

            debugLog(`arRPC process exited with code ${code}, signal ${signal}, wasReady: ${wasReady}`);

            arrpcProcess = null;
            serverPort = null;
            serverHost = null;
            startTime = null;
            readyTime = null;
            isReady = false;
            appVersion = null;

            clearInitTimeout();
            stopStateFileWatching();
        });
    } catch (e) {
        console.error("[arRPC] Failed to start arRPC server:", e);
        lastError = e instanceof Error ? e.message : String(e);
        clearInitTimeout();
    }
}

export function setupArRPC() {
    if (mainSettingsListener) {
        debugLog("arRPC already set up");
        return;
    }

    mainSettingsListener = () => {
        initArRPC();
        updateWebSocketConnection();
    };

    configSettingsListener = () => {
        if (arrpcProcess && Settings.store.arRPC) {
            restartArRPC();
        }
    };

    wsSettingsListener = () => {
        updateWebSocketConnection();
    };

    Settings.addChangeListener("arRPCDisabled", mainSettingsListener);
    Settings.addChangeListener("arRPC", mainSettingsListener);
    Settings.addChangeListener("arRPCDebug", configSettingsListener);
    Settings.addChangeListener("arRPCProcessScanning", configSettingsListener);
    Settings.addChangeListener("arRPCBridge", configSettingsListener);
    Settings.addChangeListener("arRPCWebSocketCustomHost", wsSettingsListener);
    Settings.addChangeListener("arRPCWebSocketCustomPort", wsSettingsListener);
    Settings.addChangeListener("arRPCWebSocketAutoReconnect", wsSettingsListener);
    debugLog("arRPC settings listeners registered");
}

export async function cleanupArRPC() {
    if (mainSettingsListener) {
        Settings.removeChangeListener("arRPCDisabled", mainSettingsListener);
        Settings.removeChangeListener("arRPC", mainSettingsListener);
        mainSettingsListener = null;
    }

    if (configSettingsListener) {
        Settings.removeChangeListener("arRPCDebug", configSettingsListener);
        Settings.removeChangeListener("arRPCProcessScanning", configSettingsListener);
        Settings.removeChangeListener("arRPCBridge", configSettingsListener);
        configSettingsListener = null;
    }

    if (wsSettingsListener) {
        Settings.removeChangeListener("arRPCWebSocketCustomHost", wsSettingsListener);
        Settings.removeChangeListener("arRPCWebSocketCustomPort", wsSettingsListener);
        Settings.removeChangeListener("arRPCWebSocketAutoReconnect", wsSettingsListener);
        wsSettingsListener = null;
    }

    debugLog("arRPC settings listeners removed");

    stopWebSocket();
    await destroyArRPC();
}
