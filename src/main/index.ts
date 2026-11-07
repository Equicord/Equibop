/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CommandLine, isQueryInstance } from "./cli";

if (isQueryInstance) {
    // Query-only instance, don't start the app
} else if (CommandLine.values.repair) {
    (async () => {
        const { State } = await import("./settings");
        if (State.store.equicordDir) {
            console.error("Cannot repair: using custom Equicord directory.");
            process.exit(1);
        }
        console.log("Repairing Equicord...");
        const { downloadVencordAsar } = await import("./utils/vencordLoader");
        await downloadVencordAsar();
        console.log("Repair complete.");
        process.exit(0);
    })().catch(err => {
        console.error("Failed to repair Equicord:", err);
        process.exit(1);
    });
} else {
    require("./startup");
}
