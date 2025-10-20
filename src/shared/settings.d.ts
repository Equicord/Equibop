/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Rectangle } from "electron";

export interface Settings {
    discordBranch?: "stable" | "canary" | "ptb";
    transparencyOption?: "none" | "mica" | "tabbed" | "acrylic";
    tray?: boolean;
    minimizeToTray?: boolean;
    autoStartMinimized?: boolean;
    middleClickAutoscroll?: boolean;
    openLinksWithElectron?: boolean;
    staticTitle?: boolean;
    enableMenu?: boolean;
    disableSmoothScroll?: boolean;
    hardwareAcceleration?: boolean;
    hardwareVideoAcceleration?: boolean;
    arRPC?: boolean;
    appBadge?: boolean;
    badgeOnlyForMentions?: boolean;
    disableMinSize?: boolean;
    clickTrayToShowHide?: boolean;
    customTitleBar?: boolean;
    arguments?: string;

    enableSplashScreen?: boolean;
    splashTheming?: boolean;
    splashColor?: string;
    splashBackground?: string;
    splashProgress?: boolean;
    splashPixelated?: boolean;

    spellCheckLanguages?: string[];

    audio?: {
        workaround?: boolean;

        deviceSelect?: boolean;
        granularSelect?: boolean;

        ignoreVirtual?: boolean;
        ignoreDevices?: boolean;
        ignoreInputMedia?: boolean;

        onlySpeakers?: boolean;
        onlyDefaultSpeakers?: boolean;
    };
}

export interface State {
    maximized?: boolean;
    minimized?: boolean;
    windowBounds?: Rectangle;
    displayId: number;

    firstLaunch?: boolean;

    steamOSLayoutVersion?: number;
    linuxAutoStartEnabled?: boolean;

    equicordDir?: string;

    updater?: {
        ignoredVersion?: string;
        snoozeUntil?: number;
    };
}
