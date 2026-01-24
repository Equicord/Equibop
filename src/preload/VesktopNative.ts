/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Node } from "@vencord/venmic";
import { ipcRenderer } from "electron/renderer";
import type { IpcMessage, IpcResponse } from "main/ipcCommands";
import type { Settings } from "shared/settings";

import { IpcEvents } from "../shared/IpcEvents";
import { invoke, sendSync } from "./typedIpc";

type SpellCheckerResultCallback = (word: string, suggestions: string[]) => void;

const spellCheckCallbacks = new Set<SpellCheckerResultCallback>();

const spellCheckListener = (_: Electron.IpcRendererEvent, w: string, s: string[]) => {
    spellCheckCallbacks.forEach(cb => cb(w, s));
};
ipcRenderer.on(IpcEvents.SPELLCHECK_RESULT, spellCheckListener);

type ArRPCActivityCallback = (data: unknown) => void;
const arrpcActivityCallbacks = new Set<ArRPCActivityCallback>();

const arrpcActivityListener = (_: Electron.IpcRendererEvent, data: unknown) => {
    arrpcActivityCallbacks.forEach(cb => cb(data));
};
ipcRenderer.on(IpcEvents.ARRPC_ACTIVITY, arrpcActivityListener);

let onDevtoolsOpen = () => {};
let onDevtoolsClose = () => {};

const devtoolsOpenedListener = () => onDevtoolsOpen();
const devtoolsClosedListener = () => onDevtoolsClose();
ipcRenderer.on(IpcEvents.DEVTOOLS_OPENED, devtoolsOpenedListener);
ipcRenderer.on(IpcEvents.DEVTOOLS_CLOSED, devtoolsClosedListener);

function cleanup() {
    ipcRenderer.off(IpcEvents.SPELLCHECK_RESULT, spellCheckListener);
    ipcRenderer.off(IpcEvents.ARRPC_ACTIVITY, arrpcActivityListener);
    ipcRenderer.off(IpcEvents.DEVTOOLS_OPENED, devtoolsOpenedListener);
    ipcRenderer.off(IpcEvents.DEVTOOLS_CLOSED, devtoolsClosedListener);
    spellCheckCallbacks.clear();
    arrpcActivityCallbacks.clear();
}

window.addEventListener("beforeunload", cleanup);

export const VesktopNative = {
    app: {
        relaunch: () => invoke<void>(IpcEvents.RELAUNCH),
        getVersion: () => sendSync<void>(IpcEvents.GET_VERSION),
        getGitHash: () => sendSync<string>(IpcEvents.GET_GIT_HASH),
        isDevBuild: () => IS_DEV,
        setBadgeCount: (count: number) => invoke<void>(IpcEvents.SET_BADGE_COUNT, count),
        supportsWindowsTransparency: () => sendSync<boolean>(IpcEvents.SUPPORTS_WINDOWS_TRANSPARENCY),
        getEnableHardwareAcceleration: () => sendSync<boolean>(IpcEvents.GET_ENABLE_HARDWARE_ACCELERATION),
        isOutdated: () => invoke<boolean>(IpcEvents.UPDATER_IS_OUTDATED),
        openUpdater: () => invoke<void>(IpcEvents.UPDATER_OPEN),
        getPlatformSpoofInfo: () =>
            sendSync<{
                spoofed: boolean;
                originalPlatform: string;
                spoofedPlatform: string | null;
            }>(IpcEvents.GET_PLATFORM_SPOOF_INFO),
        getRendererCss: () => invoke<string>(IpcEvents.GET_VESKTOP_RENDERER_CSS),
        onRendererCssUpdate: (cb: (newCss: string) => void) => {
            if (!IS_DEV) return () => {};

            const listener = (_e: Electron.IpcRendererEvent, newCss: string) => cb(newCss);
            ipcRenderer.on(IpcEvents.VESKTOP_RENDERER_CSS_UPDATE, listener);
            return () => ipcRenderer.off(IpcEvents.VESKTOP_RENDERER_CSS_UPDATE, listener);
        }
    },
    autostart: {
        isEnabled: () => sendSync<boolean>(IpcEvents.AUTOSTART_ENABLED),
        enable: () => invoke<void>(IpcEvents.ENABLE_AUTOSTART),
        disable: () => invoke<void>(IpcEvents.DISABLE_AUTOSTART)
    },
    fileManager: {
        isUsingCustomVencordDir: () => sendSync<boolean>(IpcEvents.IS_USING_CUSTOM_VENCORD_DIR),
        showCustomVencordDir: () => invoke<void>(IpcEvents.SHOW_CUSTOM_VENCORD_DIR),
        selectEquicordDir: (value?: null) =>
            invoke<"cancelled" | "invalid" | "ok">(IpcEvents.SELECT_VENCORD_DIR, value),
        chooseUserAsset: (asset: string, value?: null) =>
            invoke<"cancelled" | "invalid" | "ok" | "failed">(IpcEvents.CHOOSE_USER_ASSET, asset, value)
    },
    settings: {
        get: () => sendSync<Settings>(IpcEvents.GET_SETTINGS),
        set: (settings: Settings, path?: string) => invoke<void>(IpcEvents.SET_SETTINGS, settings, path)
    },
    spellcheck: {
        getAvailableLanguages: () => sendSync<string[]>(IpcEvents.SPELLCHECK_GET_AVAILABLE_LANGUAGES),
        onSpellcheckResult(cb: SpellCheckerResultCallback) {
            spellCheckCallbacks.add(cb);
        },
        offSpellcheckResult(cb: SpellCheckerResultCallback) {
            spellCheckCallbacks.delete(cb);
        },
        replaceMisspelling: (word: string) => invoke<void>(IpcEvents.SPELLCHECK_REPLACE_MISSPELLING, word),
        addToDictionary: (word: string) => invoke<void>(IpcEvents.SPELLCHECK_ADD_TO_DICTIONARY, word)
    },
    arrpc: {
        onActivity(cb: ArRPCActivityCallback) {
            arrpcActivityCallbacks.add(cb);
        },
        offActivity(cb: ArRPCActivityCallback) {
            arrpcActivityCallbacks.delete(cb);
        },
        openSettings: () => invoke<void>(IpcEvents.ARRPC_OPEN_SETTINGS)
    },
    win: {
        focus: () => invoke<void>(IpcEvents.FOCUS),
        close: (key?: string) => invoke<void>(IpcEvents.CLOSE, key),
        minimize: (key?: string) => invoke<void>(IpcEvents.MINIMIZE, key),
        maximize: (key?: string) => invoke<void>(IpcEvents.MAXIMIZE, key),
        flashFrame: (flag: boolean) => invoke<void>(IpcEvents.FLASH_FRAME, flag),
        setDevtoolsCallbacks: (onOpen: () => void, onClose: () => void) => {
            onDevtoolsOpen = onOpen;
            onDevtoolsClose = onClose;
        }
    },
    capturer: {
        getLargeThumbnail: (id: string) => invoke<string>(IpcEvents.CAPTURER_GET_LARGE_THUMBNAIL, id)
    },
    /** only available on Linux. */
    virtmic: {
        list: () =>
            invoke<
                { ok: false; isGlibCxxOutdated: boolean } | { ok: true; targets: Node[]; hasPipewirePulse: boolean }
            >(IpcEvents.VIRT_MIC_LIST),
        start: (include: Node[]) => invoke<void>(IpcEvents.VIRT_MIC_START, include),
        startSystem: (exclude: Node[]) => invoke<void>(IpcEvents.VIRT_MIC_START_SYSTEM, exclude),
        stop: () => invoke<void>(IpcEvents.VIRT_MIC_STOP)
    },
    clipboard: {
        copyImage: (imageBuffer: Uint8Array, imageSrc: string) =>
            invoke<void>(IpcEvents.CLIPBOARD_COPY_IMAGE, imageBuffer, imageSrc)
    },
    tray: {
        setVoiceState: (state: string) => invoke<void>(IpcEvents.VOICE_STATE_CHANGED, state),
        setVoiceCallState: (inCall: boolean) => invoke<void>(IpcEvents.VOICE_CALL_STATE_CHANGED, inCall)
    },
    voice: {
        onToggleSelfMute: (listener: () => void) => {
            const wrappedListener = () => listener();
            ipcRenderer.on(IpcEvents.TOGGLE_SELF_MUTE, wrappedListener);
            return () => ipcRenderer.off(IpcEvents.TOGGLE_SELF_MUTE, wrappedListener);
        },
        onToggleSelfDeaf: (listener: () => void) => {
            const wrappedListener = () => listener();
            ipcRenderer.on(IpcEvents.TOGGLE_SELF_DEAF, wrappedListener);
            return () => ipcRenderer.off(IpcEvents.TOGGLE_SELF_DEAF, wrappedListener);
        }
    },
    debug: {
        launchGpu: () => invoke<void>(IpcEvents.DEBUG_LAUNCH_GPU),
        launchWebrtcInternals: () => invoke<void>(IpcEvents.DEBUG_LAUNCH_WEBRTC_INTERNALS)
    },
    commands: {
        onCommand(cb: (message: IpcMessage) => void) {
            const listener = (_: Electron.IpcRendererEvent, message: IpcMessage) => cb(message);
            ipcRenderer.on(IpcEvents.IPC_COMMAND, listener);
            return () => ipcRenderer.off(IpcEvents.IPC_COMMAND, listener);
        },
        respond: (response: IpcResponse) => ipcRenderer.send(IpcEvents.IPC_COMMAND, response)
    }
};
