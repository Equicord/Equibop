/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Discord deletes this from the window so we need to capture it in a variable
export const { localStorage } = window;

export const isFirstRun = (() => {
    const key = "VCD_FIRST_RUN";
    if (localStorage.getItem(key) !== null) return false;
    localStorage.setItem(key, "false");
    return true;
})();

const { platform } = navigator;

export const IS_WINDOWS = platform.startsWith("Win");
export const IS_MAC = platform.startsWith("Mac");
export const IS_LINUX = platform.startsWith("Linux");
