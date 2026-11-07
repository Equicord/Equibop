/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2024 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Socket } from "net";
import { spawnSync } from "node:child_process";
import { constants, existsSync, lstatSync, open, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { IpcEvents } from "shared/IpcEvents";

import { mainWin } from "./mainWindow";

const xdgRuntimeDir = process.env.XDG_RUNTIME_DIR;
const socketFile = xdgRuntimeDir ? join(xdgRuntimeDir, "vesktop-ipc") : null;

const Actions = new Set([IpcEvents.TOGGLE_SELF_DEAF, IpcEvents.TOGGLE_SELF_MUTE]);

function createFIFO(path: string) {
    if (existsSync(path)) {
        try {
            const st = lstatSync(path);
            const myUid = typeof process.getuid === "function" ? process.getuid() : -1;
            if (st.uid !== myUid) {
                console.error("Keybind FIFO exists but is owned by another user, refusing to remove:", path);
                return false;
            }
            unlinkSync(path);
        } catch (err) {
            console.error("Failed to remove existing mkfifo file:", err);
            return false;
        }
    }

    const result = spawnSync("mkfifo", ["-m", "0600", path]);
    if (result.status !== 0) {
        console.error(
            "Failed to create mkfifo while initializing keybinds:",
            result.stderr?.toString() || result.error
        );
        return false;
    }
    return true;
}

function openFIFO(path: string) {
    try {
        const st = statSync(path);
        const myUid = typeof process.getuid === "function" ? process.getuid() : -1;
        if (st.uid !== myUid) {
            console.error("Keybind FIFO ownership changed, refusing to open:", path);
            return;
        }

        open(path, constants.O_RDONLY | constants.O_NONBLOCK, (err, fd) => {
            if (err) {
                console.error("Error opening pipe while initializing keybinds:", err);
                return;
            }

            const pipe = new Socket({ fd });
            pipe.on("data", data => {
                const action = data.toString().trim();
                if (Actions.has(action as IpcEvents)) {
                    mainWin.webContents.send(action);
                }
            });

            pipe.on("end", () => {
                pipe.destroy();
                openFIFO(path);
            });
        });
    } catch (err) {
        console.error("Can't open socket file.", err);
    }
}

function cleanup() {
    if (!socketFile) return;
    try {
        unlinkSync(socketFile);
    } catch {}
}

process.on("exit", cleanup);

export function initKeybinds() {
    if (!socketFile) {
        console.warn("Keybinds disabled: XDG_RUNTIME_DIR is not set");
        return;
    }
    if (createFIFO(socketFile)) {
        openFIFO(socketFile);
    }
}
