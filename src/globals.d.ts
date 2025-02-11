/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

declare global {
    export var VesktopNative: typeof import("preload/VesktopNative").VesktopNative;
    export var Vesktop: typeof import("renderer/index");
    export var VCDP: any;
    export var IS_DEV: boolean;
}

export {};
