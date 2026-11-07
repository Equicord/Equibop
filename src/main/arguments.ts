/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { join } from "path";

import { BrowserWindow } from "electron";
import { STATIC_DIR } from "shared/paths";

import { State } from "./settings";
import { makeLinksOpenExternally } from "./utils/makeLinksOpenExternally";
import { loadView } from "./vesktopStatic";

let argumentsWindow: BrowserWindow | null = null;

export function createArgumentsWindow() {
    if (argumentsWindow && !argumentsWindow.isDestroyed()) {
        argumentsWindow.focus();
        return argumentsWindow;
    }

    argumentsWindow = new BrowserWindow({
        center: true,
        autoHideMenuBar: true,
        ...(process.platform === "win32"
            ? { icon: join(STATIC_DIR, "icon.ico") }
            : process.platform === "linux"
              ? { icon: join(STATIC_DIR, "icon.png") }
              : {}),
        height: 480,
        width: 540,
        minHeight: 320,
        minWidth: 420
    });

    makeLinksOpenExternally(argumentsWindow);

    const data = new URLSearchParams({
        CURRENT_ARGS: State.store.launchArguments ?? ""
    });

    loadView(argumentsWindow, "arguments.html", data);

    argumentsWindow.webContents.addListener("console-message", (_e, _l, msg) => {
        if (msg === "close") {
            argumentsWindow?.close();
            return;
        }

        if (!msg.startsWith("save:")) return;

        const args = msg.slice(5);
        State.store.launchArguments = args || undefined;

        argumentsWindow?.close();
    });

    argumentsWindow.on("closed", () => {
        argumentsWindow = null;
    });

    return argumentsWindow;
}
