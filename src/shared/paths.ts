/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DATA_DIR } from "main/constants";
import { join } from "path";

export const STATIC_DIR = /* @__PURE__ */ join(__dirname, "..", "..", "static");
export const VIEW_DIR = /* @__PURE__ */ join(STATIC_DIR, "views");
export const BADGE_DIR = /* @__PURE__ */ join(STATIC_DIR, "badges");
export const ICON_PATH = /* @__PURE__ */ join(STATIC_DIR, "icon.png");
export const ICONS_DIR = /* @__PURE__ */ join(DATA_DIR, "TrayIcons");
