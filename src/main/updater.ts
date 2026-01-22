/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater, UpdateInfo } from "electron-updater";
import { join } from "path";
import { IpcEvents, UpdaterIpcEvents } from "shared/IpcEvents";
import { Millis } from "shared/utils/millis";
import { promiseWithTimeout, rejectAfterTimeout } from "shared/utils/timeout";

import { State } from "./settings";
import { handle } from "./utils/ipcWrappers";
import { makeLinksOpenExternally } from "./utils/makeLinksOpenExternally";
import { getWindowIcon } from "./utils/windowOptions";
import { loadView } from "./vesktopStatic";

const UPDATE_CHECK_TIMEOUT = 30 * Millis.SECOND;
const DOWNLOAD_TIMEOUT = 5 * Millis.MINUTE;

let updaterWindow: BrowserWindow | null = null;
let quitAndInstallTimer: NodeJS.Timeout | null = null;

type AutoUpdaterEvent = "update-available" | "update-downloaded" | "download-progress" | "error";
const registeredListeners: Array<{ event: AutoUpdaterEvent; listener: (...args: unknown[]) => void }> = [];

function addUpdaterListener<T extends AutoUpdaterEvent>(
    event: T,
    listener: T extends "update-available"
        ? (update: UpdateInfo) => void
        : T extends "download-progress"
          ? (p: { percent: number }) => void
          : T extends "error"
            ? (err: Error) => void
            : () => void
) {
    autoUpdater.on(event, listener as (...args: unknown[]) => void);
    registeredListeners.push({ event, listener: listener as (...args: unknown[]) => void });
}

addUpdaterListener("update-available", (update: UpdateInfo) => {
    if (State.store.updater?.ignoredVersion === update.version) return;
    if ((State.store.updater?.snoozeUntil ?? 0) > Date.now()) return;

    openUpdater(update);
});

addUpdaterListener("update-downloaded", () => {
    quitAndInstallTimer = setTimeout(() => {
        quitAndInstallTimer = null;
        try {
            autoUpdater.quitAndInstall();
        } catch (err) {
            console.error("[Updater] Failed to quit and install:", err);
        }
    }, 100);
});

addUpdaterListener("download-progress", (p: { percent: number }) => {
    updaterWindow?.webContents.send(UpdaterIpcEvents.DOWNLOAD_PROGRESS, p.percent);
});

addUpdaterListener("error", (err: Error) => {
    updaterWindow?.webContents.send(UpdaterIpcEvents.ERROR, err.message);
});

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.fullChangelog = true;

async function checkForUpdatesWithTimeout(): Promise<boolean> {
    try {
        const res = await promiseWithTimeout(autoUpdater.checkForUpdates(), UPDATE_CHECK_TIMEOUT);
        return Boolean(res?.isUpdateAvailable);
    } catch (err) {
        console.error("[Updater] Failed to check for updates:", err);
        return false;
    }
}

const isOutdated = checkForUpdatesWithTimeout();

handle(IpcEvents.UPDATER_IS_OUTDATED, () => isOutdated);
handle(IpcEvents.UPDATER_OPEN, async () => {
    try {
        const res = await promiseWithTimeout(autoUpdater.checkForUpdates(), UPDATE_CHECK_TIMEOUT);
        if (res?.isUpdateAvailable && res.updateInfo) openUpdater(res.updateInfo);
    } catch (err) {
        console.error("[Updater] Failed to check for updates:", err);
    }
});

function cleanupUpdaterHandlers() {
    ipcMain.removeHandler(UpdaterIpcEvents.GET_DATA);
    ipcMain.removeHandler(UpdaterIpcEvents.INSTALL);
    ipcMain.removeHandler(UpdaterIpcEvents.SNOOZE_UPDATE);
    ipcMain.removeHandler(UpdaterIpcEvents.IGNORE_UPDATE);
}

function openUpdater(update: UpdateInfo) {
    if (updaterWindow && !updaterWindow.isDestroyed()) {
        updaterWindow.focus();
        return;
    }

    cleanupUpdaterHandlers();

    updaterWindow = new BrowserWindow({
        title: "Equibop Updater",
        autoHideMenuBar: true,
        ...getWindowIcon(),
        webPreferences: {
            preload: join(__dirname, "updaterPreload.js")
        },
        minHeight: 400,
        minWidth: 750
    });
    makeLinksOpenExternally(updaterWindow);

    handle(UpdaterIpcEvents.GET_DATA, () => ({ update, version: app.getVersion() }));
    handle(UpdaterIpcEvents.INSTALL, async () => {
        try {
            await Promise.race([
                autoUpdater.downloadUpdate(),
                rejectAfterTimeout(DOWNLOAD_TIMEOUT, "Download timed out")
            ]);
        } catch (err) {
            console.error("[Updater] Failed to download update:", err);
            updaterWindow?.webContents.send(
                UpdaterIpcEvents.ERROR,
                err instanceof Error ? err.message : "Download failed"
            );
        }
    });
    handle(UpdaterIpcEvents.SNOOZE_UPDATE, () => {
        State.store.updater ??= {};
        State.store.updater.snoozeUntil = Date.now() + 1 * Millis.DAY;
        updaterWindow?.close();
    });
    handle(UpdaterIpcEvents.IGNORE_UPDATE, () => {
        State.store.updater ??= {};
        State.store.updater.ignoredVersion = update.version;
        updaterWindow?.close();
    });

    updaterWindow.on("closed", () => {
        cleanupUpdaterHandlers();
        updaterWindow = null;
    });

    loadView(updaterWindow, "updater/index.html");
}

export function cleanupUpdater() {
    if (quitAndInstallTimer) {
        clearTimeout(quitAndInstallTimer);
        quitAndInstallTimer = null;
    }

    for (const { event, listener } of registeredListeners) {
        autoUpdater.off(event, listener);
    }
    registeredListeners.length = 0;

    cleanupUpdaterHandlers();

    if (updaterWindow && !updaterWindow.isDestroyed()) {
        updaterWindow.close();
    }
    updaterWindow = null;
}

app.on("quit", cleanupUpdater);
