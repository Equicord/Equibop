/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

if (process.platform === "linux") import("./venmic");

import { execFile } from "node:child_process";
import { type FSWatcher, mkdirSync, readFileSync, watch } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import { release } from "node:os";
import { join } from "node:path";

import {
    app,
    BrowserWindow,
    clipboard,
    dialog,
    type IpcMainInvokeEvent,
    nativeImage,
    type RelaunchOptions,
    session,
    shell
} from "electron";
import { enableHardwareAcceleration } from "main";
import { STATIC_DIR } from "shared/paths";
import { debounce } from "shared/utils/debounce";

import { IpcEvents } from "../shared/IpcEvents";
import { setBadgeCount } from "./appBadge";
import { createArRPCWindow } from "./arrpcWindow";
import { autoStart } from "./autoStart";
import { VENCORD_QUICKCSS_FILE, VENCORD_THEMES_DIR } from "./constants";
import { AppEvents } from "./events";
import { getPlatformSpoofInfo } from "./gnuSpoofing";
import { mainWin } from "./mainWindow";
import { Settings, State } from "./settings";
import { handle, handleSync } from "./utils/ipcWrappers";
import { PopoutWindows } from "./utils/popout";
import { isDeckGameMode, showGamePage } from "./utils/steamOS";
import { isValidVencordInstall } from "./utils/vencordLoader";
import { VENCORD_DIR } from "./vencordDir";

handleSync(IpcEvents.DEPRECATED_GET_VENCORD_PRELOAD_SCRIPT_PATH, () => join(VENCORD_DIR, "preload.js"));
handleSync(IpcEvents.GET_VENCORD_PRELOAD_SCRIPT, () => readFileSync(join(VENCORD_DIR, "preload.js"), "utf-8"));
handleSync(IpcEvents.GET_VENCORD_RENDERER_SCRIPT, () => readFileSync(join(VENCORD_DIR, "renderer.js"), "utf-8"));

const VESKTOP_RENDERER_JS_PATH = join(__dirname, "renderer.js");
const VESKTOP_RENDERER_CSS_PATH = join(__dirname, "renderer.css");
handleSync(IpcEvents.GET_VESKTOP_RENDERER_SCRIPT, () => readFileSync(VESKTOP_RENDERER_JS_PATH, "utf-8"));
handle(IpcEvents.GET_VESKTOP_RENDERER_CSS, () => readFile(VESKTOP_RENDERER_CSS_PATH, "utf-8"));

let devCssWatcher: FSWatcher | null = null;

if (IS_DEV) {
    devCssWatcher = watch(VESKTOP_RENDERER_CSS_PATH, { persistent: false }, async () => {
        try {
            mainWin?.webContents.postMessage(
                IpcEvents.VESKTOP_RENDERER_CSS_UPDATE,
                await readFile(VESKTOP_RENDERER_CSS_PATH, "utf-8")
            );
        } catch (err) {
            console.error("[IPC] Failed to read dev CSS:", err);
        }
    });
}

handleSync(IpcEvents.GET_SETTINGS, () => Settings.plain);
handleSync(IpcEvents.GET_VERSION, () => app.getVersion());
handleSync(IpcEvents.GET_GIT_HASH, () => EQUIBOP_GIT_HASH);
handleSync(IpcEvents.GET_ENABLE_HARDWARE_ACCELERATION, () => enableHardwareAcceleration);

handleSync(
    IpcEvents.SUPPORTS_WINDOWS_TRANSPARENCY,
    () => process.platform === "win32" && Number(release().split(".").pop()) >= 22621
);

handleSync(IpcEvents.AUTOSTART_ENABLED, () => autoStart.isEnabled());
handle(IpcEvents.ENABLE_AUTOSTART, autoStart.enable);
handle(IpcEvents.DISABLE_AUTOSTART, autoStart.disable);

handle(IpcEvents.ARRPC_OPEN_SETTINGS, () => {
    createArRPCWindow();
});

handleSync(IpcEvents.GET_PLATFORM_SPOOF_INFO, () => getPlatformSpoofInfo());

handle(IpcEvents.SET_SETTINGS, (_, settings: typeof Settings.store, path?: string) => {
    Settings.setData(settings, path);
});

handle(IpcEvents.RELAUNCH, async () => {
    const options: RelaunchOptions = {
        args: process.argv.slice(1).concat(["--relaunch"])
    };
    if (isDeckGameMode) {
        // We can't properly relaunch when running under gamescope, but we can at least navigate to our page in Steam.
        await showGamePage();
    } else if (process.platform === "linux" && app.isPackaged && process.env.APPIMAGE) {
        execFile(process.env.APPIMAGE, options.args, { windowsHide: true });
    } else {
        app.relaunch(options);
    }
    app.exit();
});

handleSync(IpcEvents.IS_USING_CUSTOM_VENCORD_DIR, () => !!State.store.equicordDir);
handle(IpcEvents.SHOW_CUSTOM_VENCORD_DIR, async () => {
    const { equicordDir } = State.store;
    if (!equicordDir) return;

    const stats = await stat(equicordDir);
    if (!stats.isDirectory()) return;

    shell.openPath(equicordDir);
});

function getWindow(e: IpcMainInvokeEvent, key?: string) {
    return key ? PopoutWindows.get(key)! : (BrowserWindow.fromWebContents(e.sender) ?? mainWin);
}

handle(IpcEvents.FOCUS, () => {
    mainWin.show();
    mainWin.setSkipTaskbar(false);
});

handle(IpcEvents.CLOSE, (e, key?: string) => {
    getWindow(e, key).close();
});

handle(IpcEvents.MINIMIZE, (e, key?: string) => {
    getWindow(e, key).minimize();
});

handle(IpcEvents.MAXIMIZE, (e, key?: string) => {
    const win = getWindow(e, key);
    if (win.isMaximized()) {
        win.unmaximize();
    } else {
        win.maximize();
    }
});

handleSync(IpcEvents.SPELLCHECK_GET_AVAILABLE_LANGUAGES, e => {
    e.returnValue = session.defaultSession.availableSpellCheckerLanguages;
});

handle(IpcEvents.SPELLCHECK_REPLACE_MISSPELLING, (e, word: string) => {
    e.sender.replaceMisspelling(word);
});

handle(IpcEvents.SPELLCHECK_ADD_TO_DICTIONARY, (e, word: string) => {
    e.sender.session.addWordToSpellCheckerDictionary(word);
});

handle(IpcEvents.SELECT_VENCORD_DIR, async (_e, value?: null) => {
    if (value === null) {
        delete State.store.equicordDir;
        return "ok";
    }

    const res = await dialog.showOpenDialog(mainWin!, {
        properties: ["openDirectory"]
    });
    if (!res.filePaths.length) return "cancelled";

    const dir = res.filePaths[0];
    if (!isValidVencordInstall(dir)) return "invalid";

    State.store.equicordDir = dir;

    return "ok";
});

handle(IpcEvents.SET_BADGE_COUNT, (_, count: number) => setBadgeCount(count));

handle(IpcEvents.FLASH_FRAME, (_, flag: boolean) => {
    if (!mainWin || mainWin.isDestroyed() || (flag && mainWin.isFocused())) return;
    mainWin.flashFrame(flag);
});

handle(IpcEvents.CLIPBOARD_COPY_IMAGE, async (_, buf: ArrayBuffer, src: string) => {
    clipboard.write({
        html: `<img src="${src.replaceAll('"', '\\"')}">`,
        image: nativeImage.createFromBuffer(Buffer.from(buf))
    });
});

function openDebugPage(page: string) {
    const win = new BrowserWindow({
        autoHideMenuBar: true,
        ...(process.platform === "win32"
            ? { icon: join(STATIC_DIR, "icon.ico") }
            : process.platform === "linux"
              ? { icon: join(STATIC_DIR, "icon.png") }
              : {})
    });

    win.loadURL(page);
}

handle(IpcEvents.DEBUG_LAUNCH_GPU, () => openDebugPage("chrome://gpu"));
handle(IpcEvents.DEBUG_LAUNCH_WEBRTC_INTERNALS, () => openDebugPage("chrome://webrtc-internals"));

function readCss() {
    return readFile(VENCORD_QUICKCSS_FILE, "utf-8").catch(() => "");
}

let quickCssWatcher: FSWatcher | null = null;
let themesWatcher: FSWatcher | null = null;

open(VENCORD_QUICKCSS_FILE, "a+")
    .then(fd => {
        fd.close();
        quickCssWatcher = watch(
            VENCORD_QUICKCSS_FILE,
            { persistent: false },
            debounce(async () => {
                mainWin?.webContents.postMessage(IpcEvents.VENCORD_QUICK_CSS_UPDATE, await readCss());
            }, 50)
        );
    })
    .catch(err => {
        console.error("Failed to setup quickCss file watcher:", err);
    });

mkdirSync(VENCORD_THEMES_DIR, { recursive: true });
themesWatcher = watch(
    VENCORD_THEMES_DIR,
    { persistent: false },
    debounce(() => {
        mainWin?.webContents.postMessage(IpcEvents.VENCORD_THEME_UPDATE, void 0);
    })
);

export function cleanupFileWatchers() {
    if (quickCssWatcher) {
        quickCssWatcher.close();
        quickCssWatcher = null;
    }
    if (themesWatcher) {
        themesWatcher.close();
        themesWatcher = null;
    }
    if (devCssWatcher) {
        devCssWatcher.close();
        devCssWatcher = null;
    }
}

app.on("quit", cleanupFileWatchers);

handle(IpcEvents.VOICE_STATE_CHANGED, (_, variant: string) => {
    AppEvents.emit("setTrayVariant", variant as any);
});

handle(IpcEvents.VOICE_CALL_STATE_CHANGED, (_, inCall: boolean) => {
    AppEvents.emit("voiceCallStateChanged", inCall);
});
