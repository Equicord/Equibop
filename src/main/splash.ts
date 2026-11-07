/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { join } from "path";

import { BrowserWindow } from "electron";
import { SplashProps } from "shared/browserWinProperties";
import { STATIC_DIR } from "shared/paths";

import { DATA_DIR } from "./constants";
import { Settings } from "./settings";
import { fileExistsAsync } from "./utils/fileExists";

export let splash: BrowserWindow | undefined;
import { loadView } from "./vesktopStatic";

const totalTasks = 9;
let doneTasks = 0;

let splashReady = false;
const pendingSplashMessages: Array<[string, unknown]> = [];

function sendToSplash(channel: string, payload: unknown) {
    if (!splash || splash.isDestroyed()) return;
    if (splashReady) {
        splash.webContents.send(channel, payload);
    } else {
        pendingSplashMessages.push([channel, payload]);
    }
}

export async function createSplashWindow(startMinimized = false) {
    splash = new BrowserWindow({
        ...SplashProps,
        ...(process.platform === "win32"
            ? { icon: join(STATIC_DIR, "icon.ico") }
            : process.platform === "linux"
              ? { icon: join(STATIC_DIR, "icon.png") }
              : {}),
        show: !startMinimized,
        webPreferences: {
            preload: join(__dirname, "splashPreload.js")
        }
    });

    splash.webContents.setMaxListeners(15);

    const { splashBackground, splashColor, splashTheming, splashProgress, splashPixelated } = Settings.store;

    const params = new URLSearchParams();
    if (splashTheming) {
        if (splashColor) params.set("fg", splashColor);
        if (splashBackground) params.set("bg", splashBackground);
    }
    if (splashPixelated) params.set("pixelated", "");

    loadView(splash, "splash.html", params);

    const customSplashPath = join(DATA_DIR, "userAssets", "splash");
    const hasCustomSplash = await fileExistsAsync(customSplashPath);

    if (!hasCustomSplash) {
        splash.webContents.insertCSS(`
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(-360deg); }
            }

            img {
                animation: spin 2s linear infinite;
            }
        `);
    }

    if (!splashProgress) {
        sendToSplash("set-splash-progress-visible", false);
    }

    splash.webContents.once("did-finish-load", () => {
        if (!splash || splash.isDestroyed()) return;
        splashReady = true;
        for (const [channel, payload] of pendingSplashMessages) {
            if (!splash || splash.isDestroyed()) return;
            splash.webContents.send(channel, payload);
        }
        pendingSplashMessages.length = 0;
    });

    splash.on("closed", () => {
        splashReady = false;
        pendingSplashMessages.length = 0;
    });

    return splash;
}

export function addSplashLog() {
    if (!splash || splash.isDestroyed()) return;
    doneTasks++;
    const percentage = Math.min(100, Math.round((doneTasks / totalTasks) * 100));
    sendToSplash("update-splash-progress", percentage);
}

export function getSplash() {
    return splash;
}

export function updateSplashMessage(message: string) {
    sendToSplash("update-splash-message", message);
}
