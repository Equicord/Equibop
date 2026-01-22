/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow } from "electron";

import { getArRPCStatus, restartArRPC } from "./arrpc";
import { Settings } from "./settings";
import { makeLinksOpenExternally } from "./utils/makeLinksOpenExternally";
import { getWindowIcon } from "./utils/windowOptions";
import { loadView } from "./vesktopStatic";

let arrpcWindow: BrowserWindow | null = null;
let statusInterval: NodeJS.Timeout | null = null;
let lastStatusJson: string | null = null;

export function createArRPCWindow() {
    if (arrpcWindow && !arrpcWindow.isDestroyed()) {
        arrpcWindow.focus();
        return arrpcWindow;
    }

    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }

    arrpcWindow = new BrowserWindow({
        center: true,
        autoHideMenuBar: true,
        ...getWindowIcon(),
        height: 450,
        width: 500,
        resizable: false
    });

    makeLinksOpenExternally(arrpcWindow);

    const settings = Settings.store;
    const status = getArRPCStatus();

    const data = new URLSearchParams({
        arRPCDisabled: String(settings.arRPCDisabled ?? false),
        arRPC: String(settings.arRPC ?? false),
        arRPCProcessScanning: String(settings.arRPCProcessScanning ?? true),
        arRPCDebug: String(settings.arRPCDebug ?? false),
        arRPCWebSocketAutoReconnect: String(settings.arRPCWebSocketAutoReconnect ?? true),
        arRPCWebSocketCustomHost: settings.arRPCWebSocketCustomHost ?? "",
        arRPCWebSocketCustomPort: String(settings.arRPCWebSocketCustomPort ?? ""),
        status: JSON.stringify(status)
    });

    loadView(arrpcWindow, "arrpc.html", data);

    statusInterval = setInterval(() => {
        if (!statusInterval || !arrpcWindow || arrpcWindow.isDestroyed()) return;

        const currentStatus = getArRPCStatus();
        const statusJson = JSON.stringify(currentStatus);
        if (statusJson !== lastStatusJson) {
            lastStatusJson = statusJson;
            arrpcWindow.webContents.executeJavaScript(`window.updateStatus && window.updateStatus(${statusJson})`);
        }
    }, 2000);

    arrpcWindow.webContents.addListener("console-message", e => {
        const msg = e.message;
        if (msg === "close") {
            arrpcWindow?.close();
            return;
        }

        if (msg === "restart") {
            restartArRPC().catch(e => console.error("Failed to restart arRPC:", e));
            return;
        }

        if (!msg.startsWith("set:")) return;

        const [key, value] = msg.slice(4).split("=");

        switch (key) {
            case "arRPCDisabled":
                Settings.store.arRPCDisabled = value === "true";
                break;
            case "arRPC":
                Settings.store.arRPC = value === "true";
                break;
            case "arRPCProcessScanning":
                Settings.store.arRPCProcessScanning = value === "true";
                break;
            case "arRPCDebug":
                Settings.store.arRPCDebug = value === "true";
                break;
            case "arRPCWebSocketAutoReconnect":
                Settings.store.arRPCWebSocketAutoReconnect = value === "true";
                break;
            case "arRPCWebSocketCustomHost":
                Settings.store.arRPCWebSocketCustomHost = value || undefined;
                break;
            case "arRPCWebSocketCustomPort":
                Settings.store.arRPCWebSocketCustomPort = value ? parseInt(value, 10) : undefined;
                break;
        }
    });

    arrpcWindow.on("closed", () => {
        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
        }
        lastStatusJson = null;
        arrpcWindow = null;
    });

    return arrpcWindow;
}
