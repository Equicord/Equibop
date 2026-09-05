/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "./settings";

export const DefaultEquibopSettings: Settings = {
    discordBranch: "stable",
    hardwareAcceleration: true,
    hardwareVideoAcceleration: false,
    nativeTitleBar: process.platform !== "win32",
    staticTitle: false,
    enableMenu: false,
    enableShadow: true,
    enableRoundedCorners: true,
    enableSplashScreen: true,
    splashTheming: true,
    splashProgress: false,
    splashPixelated: false,
    tray: true,
    minimizeToTray: true,
    clickTrayToShowHide: false,
    disableMinSize: false,
    disableSmoothScroll: false,
    enableTaskbarFlashing: false,
    arRPC: false,
    arRPCDisabled: false,
    arRPCDebug: false,
    arRPCProcessScanning: true,
    arRPCWebSocketAutoReconnect: true,
    openLinksWithElectron: false,
    middleClickAutoscroll: false,
    autoStartMinimized: false,
    webRTCIPHandlingPolicy: "default",
    appBadge: true,
    badgeOnlyForMentions: false,
    transparencyOption: "none"
};
