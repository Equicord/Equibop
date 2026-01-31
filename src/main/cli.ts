/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";

import { app } from "electron";
import { IpcCommands, IpcEvents } from "shared/IpcEvents";
import { stripIndent } from "shared/utils/text";
import { parseArgs, ParseArgsOptionDescriptor } from "util";

type Option = ParseArgsOptionDescriptor & {
    description: string;
    hidden?: boolean;
    options?: string[];
    argumentName?: string;
};

const options = {
    "start-minimized": {
        default: false,
        type: "boolean",
        short: "m",
        description: "Start the application minimized to the system tray"
    },
    "windows-spoof": {
        default: false,
        type: "boolean",
        description: "Spoofs the Operating System to Windows (only available on non-windows based OS)"
    },
    version: {
        type: "boolean",
        short: "v",
        description: "Print the application version and exit"
    },
    help: {
        type: "boolean",
        short: "h",
        description: "Print help information and exit"
    },
    "user-agent": {
        type: "string",
        argumentName: "ua",
        description: "Set a custom User-Agent. May trigger anti-spam or break voice chat"
    },
    "user-agent-os": {
        type: "string",
        description: "Set User-Agent to a specific operating system. May trigger anti-spam or break voice chat",
        options: ["windows", "linux", "darwin"]
    },
    "toggle-mic": {
        type: "boolean",
        hidden: process.platform !== "linux",
        description: "Toggle your microphone status"
    },
    "toggle-deafen": {
        type: "boolean",
        hidden: process.platform !== "linux",
        description: "Toggle your deafen status"
    },
    "is-in-call": {
        type: "boolean",
        description: "Check if you are currently in a voice call"
    },
    "get-voice-channel-name": {
        type: "boolean",
        description: "Get the name of the voice channel you are in"
    },
    "get-call-duration": {
        type: "boolean",
        description: "Get the duration of the current call ([hh]:mm:ss)"
    }
} satisfies Record<string, Option>;

// only for help display
const extraOptions = {
    "enable-features": {
        type: "string",
        description: "Enable specific Chromium features",
        argumentName: "feature1,feature2,…"
    },
    "disable-features": {
        type: "string",
        description: "Disable specific Chromium features",
        argumentName: "feature1,feature2,…"
    },
    "ozone-platform": {
        hidden: process.platform !== "linux",
        type: "string",
        description: "Whether to run Equibop in Wayland or X11 (XWayland)",
        options: ["x11", "wayland"]
    }
} satisfies Record<string, Option>;

const args = basename(process.argv[0]).toLowerCase().startsWith("electron")
    ? process.argv.slice(2)
    : process.argv.slice(1);

export const CommandLine = parseArgs({
    args,
    options,
    strict: false as true, // we manually check later, so cast to true to get better types
    allowPositionals: true
});

export function checkCommandLineForHelpOrVersion() {
    const { help, version } = CommandLine.values;

    if (version) {
        console.log(`Equibop v${app.getVersion()}`);
        app.exit(0);
    }

    if (help) {
        const base = stripIndent`
            Equibop v${app.getVersion()}

            Usage: ${basename(process.execPath)} [options] [url]

            Electron Options:
              See <https://www.electronjs.org/docs/latest/api/command-line-switches#electron-cli-flags>

            Chromium Options:
              See <https://peter.sh/experiments/chromium-command-line-switches> - only some of them work

            Vesktop Options:
        `;

        const optionLines = Object.entries(options)
            .sort(([a], [b]) => a.localeCompare(b))
            .concat(Object.entries(extraOptions))
            .filter(([, opt]) => !("hidden" in opt && opt.hidden))
            .map(([name, opt]) => {
                const flags = [
                    "short" in opt && `-${opt.short}`,
                    `--${name}`,
                    opt.type !== "boolean" &&
                        ("options" in opt ? `<${opt.options.join(" | ")}>` : `<${opt.argumentName ?? opt.type}>`)
                ]
                    .filter(Boolean)
                    .join(" ");

                return [flags, opt.description];
            });

        const padding = optionLines.reduce((max, [flags]) => Math.max(max, flags.length), 0) + 4;

        const optionsHelp = optionLines
            .map(([flags, description]) => `  ${flags.padEnd(padding, " ")}${description}`)
            .join("\n");

        console.log(base + "\n" + optionsHelp);
        app.exit(0);
    }

    for (const [name, def] of Object.entries(options)) {
        const value = CommandLine.values[name];
        if (value == null) continue;

        if (typeof value !== def.type) {
            console.error(`Invalid options. Expected ${def.type === "boolean" ? "no" : "an"} argument for --${name}`);
            app.exit(1);
        }

        if ("options" in def && !def.options?.includes(value as string)) {
            console.error(`Invalid value for --${name}: ${value}\nExpected one of: ${def.options.join(", ")}`);
            app.exit(1);
        }
    }
}

function checkCommandLineForToggleCommands() {
    const { "toggle-mic": toggleMic, "toggle-deafen": toggleDeafen } = CommandLine.values;

    if (!toggleMic && !toggleDeafen) return false;
    if (!app.requestSingleInstanceLock({ IS_DEV })) {
        app.exit(0);
    }

    console.error("Equibop is not running. Toggle commands require a running instance.");
    app.exit(1);
}

function checkCommandLineForQueryCommands() {
    const { "is-in-call": isInCall, "get-voice-channel-name": getVoiceChannelName, "get-call-duration": getCallDuration } = CommandLine.values;

    if (!isInCall && !getVoiceChannelName && !getCallDuration) return false;

    const query = isInCall
        ? IpcCommands.QUERY_IS_IN_CALL
        : getVoiceChannelName
            ? IpcCommands.QUERY_VOICE_CHANNEL_NAME
            : IpcCommands.QUERY_CALL_DURATION;
    const responseFile = join(tmpdir(), `equibop-query-${Date.now()}-${process.pid}.tmp`);

    if (!app.requestSingleInstanceLock({ IS_DEV, query, responseFile })) {
        // The first instance will make a response file for us to use.
        // Poll for it.
        const startTime = Date.now();
        const timeout = 10000;
        const interval = setInterval(() => {
            try {
                const result = readFileSync(responseFile, "utf-8");
                clearInterval(interval);
                try {
                    unlinkSync(responseFile);
                } catch {}
                console.log(result);
                app.exit(0);
            } catch {
                if (Date.now() - startTime > timeout) {
                    clearInterval(interval);
                    console.error("Timed out waiting for response from running instance.");
                    app.exit(1);
                }
            }
        }, 50);
        return true;
    }

    console.error("Equibop is not running. Query commands require a running instance.");
    app.exit(1);
}

function setupSecondInstanceHandler() {
    app.on("second-instance", (_event, commandLine, _cwd, data: any) => {
        if (data.IS_DEV) {
            app.quit();
            return;
        }

        if (data.query && data.responseFile) {
            import("./ipcCommands").then(({ sendRendererCommand }) => {
                sendRendererCommand<string>(data.query)
                    .then(result => {
                        writeFileSync(data.responseFile, String(result));
                    })
                    .catch(err => {
                        writeFileSync(data.responseFile, `Error: ${err}`);
                    });
            });
            return;
        }

        const isToggleCommand = commandLine.some(arg => arg === "--toggle-mic" || arg === "--toggle-deafen");
        if (isToggleCommand) {
            const command = commandLine.includes("--toggle-mic")
                ? IpcEvents.TOGGLE_SELF_MUTE
                : IpcEvents.TOGGLE_SELF_DEAF;

            import("./mainWindow").then(({ mainWin }) => {
                if (mainWin) {
                    mainWin.webContents.send(command);
                }
            });
        } else {
            import("./mainWindow").then(({ mainWin }) => {
                if (mainWin) {
                    if (mainWin.isMinimized()) mainWin.restore();
                    if (!mainWin.isVisible()) mainWin.show();
                    mainWin.focus();
                }
            });
        }
    });
}

function checkForSecondInstance() {
    if (checkCommandLineForToggleCommands()) return;
    if (checkCommandLineForQueryCommands()) return;

    if (!app.requestSingleInstanceLock({ IS_DEV })) {
        if (IS_DEV) {
            console.log("Equibop is already running. Quitting previous instance...");
            return;
        } else {
            console.log("Equibop is already running. Quitting...");
            app.exit(0);
        }
    }

    setupSecondInstanceHandler();
}

checkCommandLineForHelpOrVersion();
checkForSecondInstance();
