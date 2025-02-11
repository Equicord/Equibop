/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
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

export type NavigatorUAData = {
    platform: string;
    brands: Array<{ brand: string; version: string }>;
    mobile: boolean;
};

export interface NavigatorExtended extends Navigator {
    userAgentData?: NavigatorUAData;
}

const getPlatform = (): string => {
    const navigatorExtended = navigator as NavigatorExtended;

    if (navigatorExtended.userAgentData) {
        return navigatorExtended.userAgentData.platform;
    }

    return navigator.userAgent; // Fallback for older browsers
};

const platform = getPlatform().toLowerCase();

export const isWindows = platform.includes("win");
export const isMac = platform.includes("mac");
export const isLinux = platform.includes("linux");

type ClassNameFactoryArg = string | string[] | Record<string, unknown> | false | null | undefined | 0 | "";
/**
 * @param prefix The prefix to add to each class, defaults to `""`
 * @returns A classname generator function
 * @example
 * const cl = classNameFactory("plugin-");
 *
 * cl("base", ["item", "editable"], { selected: null, disabled: true })
 * // => "plugin-base plugin-item plugin-editable plugin-disabled"
 */
export const classNameFactory =
    (prefix: string = "") =>
    (...args: ClassNameFactoryArg[]) => {
        const classNames = new Set<string>();
        for (const arg of args) {
            if (arg && typeof arg === "string") classNames.add(arg);
            else if (Array.isArray(arg)) arg.forEach(name => classNames.add(name));
            else if (arg && typeof arg === "object")
                Object.entries(arg).forEach(([name, value]) => value && classNames.add(name));
        }
        return Array.from(classNames, name => prefix + name).join(" ");
    };
