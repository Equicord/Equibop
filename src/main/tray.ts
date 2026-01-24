/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, Menu, NativeImage, nativeImage, Tray } from "electron";
import { join } from "path";
import { STATIC_DIR } from "shared/paths";

import { createAboutWindow } from "./about";
import { createArgumentsWindow } from "./arguments";
import { restartArRPC } from "./arrpc";
import { IS_LINUX } from "./constants";
import { AppEvents } from "./events";
import { Settings } from "./settings";
import { resolveAssetPath, UserAssetType } from "./userAssets";
import { clearData } from "./utils/clearData";
import { downloadVencordAsar } from "./utils/vencordLoader";

type TrayVariant = "tray" | "trayUnread" | "traySpeaking" | "trayIdle" | "trayMuted" | "trayDeafened";

let nativeSNI: typeof import("libvesktop") | null = null;
if (IS_LINUX) {
    try {
        nativeSNI = require(join(STATIC_DIR, `dist/libvesktop-${process.arch}.node`));
    } catch (e) {
        console.warn("[Tray] Failed to load native StatusNotifierItem, falling back to Electron Tray:", e);
    }
}

let tray: Tray | null = null;
let trayVariant: TrayVariant = "tray";
let onTrayClick: (() => void) | null = null;
let onTrayRightClick: (() => void) | null = null;
let trayUpdateTimeout: NodeJS.Timeout | null = null;
let pendingTrayVariant: TrayVariant | null = null;
let nativeTrayWindow: BrowserWindow | null = null;
let nativeTrayUpdateCallback: (() => void) | null = null;

const TRAY_CACHE_MAX = 10;
const trayImageCache = new Map<string, NativeImage>();

let useNativeTray = false;
let nativeTrayInitialized = false;

async function getCachedTrayImage(variant: TrayVariant): Promise<NativeImage> {
    const path = await resolveAssetPath(variant as UserAssetType);

    const cached = trayImageCache.get(path);
    if (cached) return cached;

    if (trayImageCache.size >= TRAY_CACHE_MAX) {
        const firstKey = trayImageCache.keys().next().value;
        if (firstKey) trayImageCache.delete(firstKey);
    }

    const image = nativeImage.createFromPath(path);
    trayImageCache.set(path, image);

    return image;
}

function nativeImageToPixmap(image: NativeImage): Promise<Buffer> {
    return new Promise(resolve => {
        setImmediate(() => {
            const resized = image.resize({ width: 32, height: 32 });
            const size = resized.getSize();
            const { width } = size;
            const { height } = size;

            const bitmap = resized.toBitmap();

            const pixmapSize = 8 + bitmap.length;
            const pixmap = Buffer.allocUnsafe(pixmapSize);

            pixmap.writeUInt32LE(width, 0);
            pixmap.writeUInt32LE(height, 4);

            for (let i = 0; i < bitmap.length; i += 4) {
                const r = bitmap[i];
                const g = bitmap[i + 1];
                const b = bitmap[i + 2];
                const a = bitmap[i + 3];

                const alpha = a / 255;
                const premultR = Math.round(r * alpha);
                const premultG = Math.round(g * alpha);
                const premultB = Math.round(b * alpha);

                pixmap[8 + i] = a;
                pixmap[8 + i + 1] = premultB;
                pixmap[8 + i + 2] = premultG;
                pixmap[8 + i + 3] = premultR;
            }

            resolve(pixmap);
        });
    });
}

const userAssetChangedListener = async (asset: string) => {
    if (!asset.startsWith("tray")) return;

    try {
        trayImageCache.delete(await resolveAssetPath(asset as UserAssetType));

        if (useNativeTray && nativeSNI) {
            const image = await getCachedTrayImage(trayVariant);
            const pixmap = await nativeImageToPixmap(image);
            nativeSNI.setStatusNotifierIcon(pixmap);
        } else if (tray) {
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
            const image = await getCachedTrayImage(variant);
            const pixmap = await nativeImageToPixmap(image);
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
        pendingTrayVariant = variant;

        if (trayUpdateTimeout) return;

        updateTrayIconElectron(variant);

        trayUpdateTimeout = setTimeout(() => {
            trayUpdateTimeout = null;

            if (pendingTrayVariant && pendingTrayVariant !== trayVariant) {
                updateTrayIconElectron(pendingTrayVariant);
            }
            pendingTrayVariant = null;
        }, 100);
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

    if (trayUpdateTimeout) {
        clearTimeout(trayUpdateTimeout);
        trayUpdateTimeout = null;
    }
    pendingTrayVariant = null;

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
            if (onTrayRightClick) {
                tray.removeListener("right-click", onTrayRightClick);
                onTrayRightClick = null;
            }
            tray.destroy();
        } catch (e) {
            console.error("[Tray] Failed to destroy Electron tray:", e);
        }
        tray = null;
    }

    trayImageCache.clear();
    useNativeTray = false;
}

export async function initTray(win: BrowserWindow, setIsQuitting: (val: boolean) => void) {
    if (tray || nativeTrayInitialized) {
        try {
            destroyTray();
        } catch (e) {
            console.error("[Tray] Failed to destroy existing tray during init:", e);
        }
    }

    if (IS_LINUX && nativeSNI) {
        try {
            const success = nativeSNI.initStatusNotifierItem();
            if (success) {
                useNativeTray = true;
                nativeTrayInitialized = true;

                const initialImage = await getCachedTrayImage(trayVariant);
                const pixmap = await nativeImageToPixmap(initialImage);
                nativeSNI.setStatusNotifierIcon(pixmap);
                nativeSNI.setStatusNotifierTitle("Equibop");

                const menuItems = [
                    { id: 1, label: win.isVisible() ? "Hide" : "Open", enabled: true, visible: true },
                    { id: 2, label: "About", enabled: true, visible: true },
                    { id: 3, label: "Repair Equicord", enabled: true, visible: true },
                    { id: 4, label: "Reset Equibop", enabled: true, visible: true },
                    { id: 5, label: "Launch Arguments", enabled: true, visible: true },
                    {
                        id: 6,
                        label: "Restart arRPC",
                        enabled: true,
                        visible: Settings.store.arRPC === true
                    },
                    { id: 7, type: "separator" as const, enabled: true, visible: true },
                    { id: 8, label: "Restart", enabled: true, visible: true },
                    { id: 9, label: "Quit", enabled: true, visible: true }
                ];

                const menuResult = nativeSNI.setStatusNotifierMenu(menuItems);

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
                                    app.relaunch();
                                    app.quit();
                                })
                                .catch(e => console.error("Failed to repair Equicord:", e));
                            break;
                        case 4: // reset Equibop
                            clearData(win).catch(e => console.error("Failed to reset Equibop:", e));
                            break;
                        case 5: // launch arguments
                            createArgumentsWindow();
                            break;
                        case 6: // restart arRPC-bun
                            restartArRPC().catch(e => console.error("Failed to restart arRPC:", e));
                            break;
                        case 8: // restart
                            app.relaunch();
                            app.quit();
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
        else win.show();
    };

    const trayMenu = Menu.buildFromTemplate([
        {
            label: "Open",
            click() {
                win.show();
            }
        },
        {
            label: "About",
            click: createAboutWindow
        },
        {
            label: "Repair Equicord",
            click() {
                downloadVencordAsar()
                    .then(() => {
                        app.relaunch();
                        app.quit();
                    })
                    .catch(e => console.error("Failed to repair Equicord:", e));
            }
        },
        {
            label: "Reset Equibop",
            click() {
                clearData(win).catch(e => console.error("Failed to reset Equibop:", e));
            }
        },
        {
            label: "Launch Arguments",
            click: createArgumentsWindow
        },
        {
            label: "Restart arRPC",
            visible: Settings.store.arRPC === true,
            click() {
                restartArRPC().catch(e => console.error("Failed to restart arRPC:", e));
            }
        },
        {
            type: "separator"
        },
        {
            label: "Restart",
            click() {
                app.relaunch();
                app.quit();
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

    try {
        const initialImage = await getCachedTrayImage(trayVariant);
        tray = new Tray(initialImage);
        tray.setToolTip("Equibop");

        if (IS_LINUX) {
            tray.on("click", onTrayClick);
            onTrayRightClick = () => {
                tray?.popUpContextMenu(trayMenu);
            };
            tray.on("right-click", onTrayRightClick);
        } else {
            tray.setContextMenu(trayMenu);
            tray.on("click", onTrayClick);
        }
    } catch (e) {
        console.error("[Tray] Failed to initialize Electron tray:", e);
        tray = null;
    }
}
