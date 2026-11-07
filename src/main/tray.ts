/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { join } from "path";

import { app, type BrowserWindow, dialog, Menu, type NativeImage, nativeImage, Tray } from "electron";
import { STATIC_DIR } from "shared/paths";
import { sleep } from "shared/utils/sleep";

import { createAboutWindow } from "./about";
import { createArgumentsWindow } from "./arguments";
import { isStatusNotifierHostRegistered } from "./dbus";
import { AppEvents } from "./events";
import { Settings } from "./settings";
import { resolveAssetPath } from "./userAssets";
import { clearData } from "./utils/clearData";
import { relaunch } from "./utils/relaunch";
import { showWindow } from "./utils/showWindow";
import { downloadVencordAsar } from "./utils/vencordLoader";

type TrayVariant = "tray" | "trayUnread" | "traySpeaking" | "trayIdle" | "trayMuted" | "trayDeafened";

const isLinux = process.platform === "linux";

let nativeSNI: typeof import("libvesktop") | null = null;
if (isLinux) {
    try {
        nativeSNI = require(join(STATIC_DIR, `dist/libvesktop-${process.arch}.node`));
    } catch (e) {
        console.warn("[Tray] Failed to load native StatusNotifierItem, falling back to Electron Tray:", e);
    }
}

let tray: Tray | null = null;
let trayVariant: TrayVariant = "tray";
let onTrayClick: (() => void) | null = null;
let nativeTrayWindow: BrowserWindow | null = null;
let nativeTrayUpdateCallback: (() => void) | null = null;

const trayImageCache = new Map<string, NativeImage>();
const trayPixmapCache = new Map<string, Buffer>();

let useNativeTray = false;
let nativeTrayInitialized = false;

async function getCachedTrayImage(variant: TrayVariant): Promise<NativeImage> {
    const path = await resolveAssetPath(variant);

    const cached = trayImageCache.get(path);
    if (cached) return cached;

    const image = nativeImage.createFromPath(path);
    const resized = image.resize({ width: 32, height: 32 });
    trayImageCache.set(path, resized);

    return resized;
}

function nativeImageToPixmap(image: NativeImage): Promise<Buffer> {
    return new Promise(resolve => {
        setImmediate(() => {
            const { width, height } = image.getSize();

            const bitmap = image.toBitmap();

            const pixmapSize = 8 + bitmap.length;
            const pixmap = Buffer.allocUnsafe(pixmapSize);

            pixmap.writeUInt32LE(width, 0);
            pixmap.writeUInt32LE(height, 4);

            for (let i = 0; i < bitmap.length; i += 4) {
                const b = bitmap[i];
                const g = bitmap[i + 1];
                const r = bitmap[i + 2];
                const a = bitmap[i + 3];

                const o = 8 + i;
                pixmap[o] = a;
                pixmap[o + 1] = ((r * a + 127) * 257) >>> 16;
                pixmap[o + 2] = ((g * a + 127) * 257) >>> 16;
                pixmap[o + 3] = ((b * a + 127) * 257) >>> 16;
            }

            resolve(pixmap);
        });
    });
}

async function getCachedTrayPixmap(variant: TrayVariant): Promise<Buffer> {
    const path = await resolveAssetPath(variant);
    const cached = trayPixmapCache.get(path);
    if (cached) return cached;

    const image = await getCachedTrayImage(variant);
    const pixmap = await nativeImageToPixmap(image);
    trayPixmapCache.set(path, pixmap);

    return pixmap;
}

const userAssetChangedListener = async (asset: string) => {
    if (!asset.startsWith("tray")) return;

    try {
        if (useNativeTray && nativeSNI) {
            trayImageCache.clear();
            trayPixmapCache.clear();
            const pixmap = await getCachedTrayPixmap(trayVariant);
            nativeSNI.setStatusNotifierIcon(pixmap);
        } else if (tray) {
            trayImageCache.clear();
            trayPixmapCache.clear();
            const image = await getCachedTrayImage(trayVariant);
            tray.setImage(image);
        }
    } catch (e) {
        console.error("[Tray] Failed to update tray icon on asset change:", e);
    }
};

async function updateTrayIconNative(variant: TrayVariant) {
    if (trayVariant === variant) return;

    trayVariant = variant;

    try {
        if (useNativeTray && nativeSNI) {
            const pixmap = await getCachedTrayPixmap(variant);
            nativeSNI.setStatusNotifierIcon(pixmap);
        }
    } catch (e) {
        console.error("[Tray] Failed to update native tray icon:", e);
    }
}

async function updateTrayIconElectron(variant: TrayVariant) {
    if (!tray || trayVariant === variant) return;

    trayVariant = variant;
    try {
        const image = await getCachedTrayImage(trayVariant);
        tray.setImage(image);
    } catch (e) {
        console.error("[Tray] Failed to update Electron tray icon:", e);
    }
}

const setTrayVariantListener = (variant: TrayVariant) => {
    if (useNativeTray) {
        updateTrayIconNative(variant);
    } else {
        updateTrayIconElectron(variant);
    }
};

if (!AppEvents.listeners("userAssetChanged").includes(userAssetChangedListener)) {
    AppEvents.on("userAssetChanged", userAssetChangedListener);
}

if (!AppEvents.listeners("setTrayVariant").includes(setTrayVariantListener)) {
    AppEvents.on("setTrayVariant", setTrayVariantListener);
}

export function destroyTray() {
    AppEvents.off("userAssetChanged", userAssetChangedListener);
    AppEvents.off("setTrayVariant", setTrayVariantListener);

    if (useNativeTray && nativeSNI) {
        try {
            if (nativeTrayWindow && nativeTrayUpdateCallback) {
                nativeTrayWindow.off("show", nativeTrayUpdateCallback);
                nativeTrayWindow.off("hide", nativeTrayUpdateCallback);
                nativeTrayWindow = null;
                nativeTrayUpdateCallback = null;
            }
            nativeSNI.destroyStatusNotifierItem();
            nativeTrayInitialized = false;
        } catch (e) {
            console.error("[Tray] Failed to destroy native StatusNotifierItem:", e);
        }
    }

    if (tray) {
        try {
            if (onTrayClick) {
                tray.removeListener("click", onTrayClick);
                onTrayClick = null;
            }
            tray.destroy();
        } catch (e) {
            console.error("[Tray] Failed to destroy Electron tray:", e);
        }
        tray = null;
    }

    trayImageCache.clear();
    trayPixmapCache.clear();
    useNativeTray = false;
}

// Chromium gives up on the tray if no StatusNotifierHost is registered when it is created and never retries.
// This happens when we are autostarted before the desktop shell is ready, so wait for it first
async function waitForStatusNotifierHost() {
    if (process.platform !== "linux") return;

    for (let i = 0; i < 30; i++) {
        if (isStatusNotifierHostRegistered()) return;

        await sleep(1000);
    }

    console.warn(
        "StatusNotifierHost not registered after 30 seconds. Equibop's Tray will likely not function correctly.\n" +
            "If you are on GNOME, make sure you installed & enabled the AppIndicator and KStatusNotifierItem Support extension:\n" +
            "https://extensions.gnome.org/extension/615/appindicator-support/"
    );
}

export async function initTray(win: BrowserWindow, setIsQuitting: (val: boolean) => void) {
    if (tray || nativeTrayInitialized) {
        try {
            destroyTray();
        } catch (e) {
            console.error("[Tray] Failed to destroy existing tray during init:", e);
        }
    }

    if (isLinux && nativeSNI) {
        try {
            const success = nativeSNI.initStatusNotifierItem();
            if (success) {
                useNativeTray = true;
                nativeTrayInitialized = true;

                const pixmap = await getCachedTrayPixmap(trayVariant);
                nativeSNI.setStatusNotifierIcon(pixmap);
                nativeSNI.setStatusNotifierTitle("Equibop");

                const menuItems = [
                    { id: 1, label: win.isVisible() ? "Hide" : "Open", enabled: true, visible: true },
                    { id: 2, label: "About", enabled: true, visible: true },
                    { id: 11, type: "separator" as const, enabled: true, visible: true },
                    { id: 5, label: "Launch Arguments", enabled: true, visible: true },
                    { id: 12, type: "separator" as const, enabled: true, visible: true },
                    { id: 3, label: "Repair Equicord", enabled: true, visible: true },
                    { id: 4, label: "Reset Equibop", enabled: true, visible: true },
                    { id: 7, type: "separator" as const, enabled: true, visible: true },
                    { id: 8, label: "Restart", enabled: true, visible: true },
                    { id: 9, label: "Quit", enabled: true, visible: true }
                ];

                nativeSNI.setStatusNotifierMenu(menuItems);

                nativeTrayWindow = win;
                nativeTrayUpdateCallback = () => {
                    try {
                        nativeSNI.updateStatusNotifierMenuItem(1, win.isVisible() ? "Hide" : "Open");
                    } catch (e) {
                        console.error("[Tray] Failed to update native menu item:", e);
                    }
                };

                win.on("show", nativeTrayUpdateCallback);
                win.on("hide", nativeTrayUpdateCallback);

                nativeSNI.setStatusNotifierMenuClickCallback((id: number) => {
                    switch (id) {
                        case 1: // open/hide
                            if (win.isVisible()) win.hide();
                            else win.show();
                            break;
                        case 2: // about
                            createAboutWindow();
                            break;
                        case 3: // repair equicord
                            downloadVencordAsar()
                                .then(() => {
                                    setTimeout(() => {
                                        destroyTray();
                                        relaunch();
                                    }, 0);
                                })
                                .catch(err => {
                                    console.error("[Tray] Repair Equicord failed:", err);
                                    dialog.showErrorBox(
                                        "Repair Equicord failed",
                                        `Could not download Equicord:\n\n${err instanceof Error ? err.message : String(err)}`
                                    );
                                });
                            break;
                        case 4: // reset Equibop
                            clearData(win);
                            break;
                        case 5: // launch arguments
                            createArgumentsWindow();
                            break;
                        case 8: // restart
                            setTimeout(() => {
                                destroyTray();
                                relaunch();
                            }, 0);
                            break;
                        case 9: // quit
                            setIsQuitting(true);
                            app.quit();
                            break;
                    }
                });

                nativeSNI.setStatusNotifierActivateCallback(() => {
                    if (Settings.store.clickTrayToShowHide && win.isVisible()) win.hide();
                    else win.show();
                });

                return;
            }
        } catch (e) {
            console.warn("[Tray] Failed to initialize native StatusNotifierItem, falling back to Electron Tray:", e);
        }
    }

    useNativeTray = false;

    onTrayClick = () => {
        if (Settings.store.clickTrayToShowHide && win.isVisible()) win.hide();
        else showWindow(win);
    };

    const trayMenu = Menu.buildFromTemplate([
        {
            label: "Open",
            click() {
                showWindow(win);
            }
        },
        {
            label: "About",
            click: createAboutWindow
        },
        { type: "separator" },
        {
            label: "Launch Arguments",
            click: createArgumentsWindow
        },
        { type: "separator" },
        {
            label: "Repair Equicord",
            async click() {
                try {
                    await downloadVencordAsar();
                } catch (err) {
                    console.error("[Tray] Repair Equicord failed:", err);
                    dialog.showErrorBox(
                        "Repair Equicord failed",
                        `Could not download Equicord:\n\n${err instanceof Error ? err.message : String(err)}`
                    );
                    return;
                }
                destroyTray();
                relaunch();
            }
        },
        {
            label: "Reset Equibop",
            async click() {
                await clearData(win);
            }
        },
        { type: "separator" },
        {
            label: "Restart",
            click() {
                destroyTray();
                relaunch();
            }
        },
        {
            label: "Quit",
            click() {
                setIsQuitting(true);
                app.quit();
            }
        }
    ]);

    await waitForStatusNotifierHost();
    if (Settings.store.tray === false) return;

    try {
        const initialImage = await getCachedTrayImage(trayVariant);
        tray = new Tray(initialImage);
        tray.setToolTip("Equibop");

        if (isLinux) {
            tray.on("click", onTrayClick);
            tray.on("right-click", () => {
                tray!.popUpContextMenu(trayMenu);
            });
        } else {
            tray.setContextMenu(trayMenu);
            tray.on("click", onTrayClick);
        }
    } catch (e) {
        console.error("[Tray] Failed to initialize Electron tray:", e);
        tray = null;
    }
}
