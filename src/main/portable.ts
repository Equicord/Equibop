/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// This must run before anything touches userData, notably app.requestSingleInstanceLock() in cli.ts
// (creates `lockfile`) and electron-updater (creates `.updaterId`). Keep this module free of local imports.
const equibopDir = dirname(process.execPath);

const PORTABLE =
    process.platform === "win32" &&
    !process.execPath.toLowerCase().endsWith("electron.exe") &&
    !existsSync(join(equibopDir, "Uninstall Equibop.exe"));

if (PORTABLE) {
    const dataDir = join(equibopDir, "Data");
    mkdirSync(dataDir, { recursive: true });
    app.setPath("userData", dataDir);
}
