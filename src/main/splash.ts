/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, nativeTheme } from "electron";
import { join } from "path";
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
    loadView(splash, "splash.html");

    const { splashBackground, splashColor, splashTheming, splashProgress, splashPixelated } = Settings.store;

    const isDark = nativeTheme.shouldUseDarkColors;
    const systemBg = isDark ? "hsl(223 6.7% 20.6%)" : "white";
    const systemFg = isDark ? "white" : "black";
    const systemFgSemiTrans = isDark ? "rgb(255 255 255 / 0.2)" : "rgb(0 0 0 / 0.2)";

    if (splashTheming) {
        const fg = splashColor || systemFg;
        const bg = splashBackground || systemBg;
        const fgSemiTrans = splashColor
            ? splashColor.replace("rgb(", "rgba(").replace(")", ", 0.2)")
            : systemFgSemiTrans;

        splash.webContents.insertCSS(
            `body { --bg: ${bg} !important; --fg: ${fg} !important; --fg-semi-trans: ${fgSemiTrans} !important; }`
        );
    } else {
        splash.webContents.insertCSS(
            `body { --bg: ${systemBg} !important; --fg: ${systemFg} !important; --fg-semi-trans: ${systemFgSemiTrans} !important; }`
        );
    }

    if (splashPixelated) {
        splash.webContents.insertCSS(`img { image-rendering: pixelated; }`);
    }

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
