/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { contextBridge, ipcRenderer } from "electron/renderer";
import type { UpdateInfo } from "electron-updater";
import { UpdaterIpcEvents } from "shared/IpcEvents";

import { invoke } from "./typedIpc";

let progressListener: ((event: Electron.IpcRendererEvent, percent: number) => void) | null = null;
let errorListener: ((event: Electron.IpcRendererEvent, message: string) => void) | null = null;

function cleanup() {
    if (progressListener) {
        ipcRenderer.off(UpdaterIpcEvents.DOWNLOAD_PROGRESS, progressListener);
        progressListener = null;
    }
    if (errorListener) {
        ipcRenderer.off(UpdaterIpcEvents.ERROR, errorListener);
        errorListener = null;
    }
}

window.addEventListener("beforeunload", cleanup);

contextBridge.exposeInMainWorld("VesktopUpdaterNative", {
    getData: () => invoke<UpdateInfo>(UpdaterIpcEvents.GET_DATA),
    installUpdate: () => invoke(UpdaterIpcEvents.INSTALL),
    onProgress: (cb: (percent: number) => void) => {
        if (progressListener) {
            ipcRenderer.off(UpdaterIpcEvents.DOWNLOAD_PROGRESS, progressListener);
        }
        progressListener = (_, percent: number) => cb(percent);
        ipcRenderer.on(UpdaterIpcEvents.DOWNLOAD_PROGRESS, progressListener);
    },
    onError: (cb: (message: string) => void) => {
        if (errorListener) {
            ipcRenderer.off(UpdaterIpcEvents.ERROR, errorListener);
        }
        errorListener = (_, message: string) => cb(message);
        ipcRenderer.on(UpdaterIpcEvents.ERROR, errorListener);
    },
    snoozeUpdate: () => invoke(UpdaterIpcEvents.SNOOZE_UPDATE),
    ignoreUpdate: () => invoke(UpdaterIpcEvents.IGNORE_UPDATE)
});
