/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { contextBridge, ipcRenderer } from "electron/renderer";
import { IpcEvents } from "shared/IpcEvents";

let messageListener: ((event: Electron.IpcRendererEvent, message: string) => void) | null = null;

function cleanup() {
    if (messageListener) {
        ipcRenderer.off(IpcEvents.UPDATE_SPLASH_MESSAGE, messageListener);
        messageListener = null;
    }
}

window.addEventListener("beforeunload", cleanup);

contextBridge.exposeInMainWorld("VesktopSplashNative", {
    onUpdateMessage(callback: (message: string) => void) {
        if (messageListener) {
            ipcRenderer.off(IpcEvents.UPDATE_SPLASH_MESSAGE, messageListener);
        }
        messageListener = (_, message: string) => callback(message);
        ipcRenderer.on(IpcEvents.UPDATE_SPLASH_MESSAGE, messageListener);
    }
});
