/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BrowserWindowConstructorOptions } from "electron";
import { join } from "path";
import { STATIC_DIR } from "shared/paths";

import { IS_LINUX, IS_WINDOWS } from "../constants";

export function getWindowIcon(): BrowserWindowConstructorOptions {
    if (IS_WINDOWS) return { icon: join(STATIC_DIR, "icon.ico") };
    if (IS_LINUX) return { icon: join(STATIC_DIR, "icon.png") };
    return {};
}
