/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, HeadingTertiary, Paragraph } from "@equicord/types/components";
import { useAwaiter } from "@equicord/types/utils";

import { cl } from "./Settings";

export function Updater() {
    const [isOutdated] = useAwaiter(VesktopNative.app.isOutdated);

    if (!isOutdated) return null;

    return (
        <div className={cl("updater-card")}>
            <HeadingTertiary>Your Equibop is outdated!</HeadingTertiary>
            <Paragraph>Staying up to date is important for security and stability.</Paragraph>

            <Button onClick={() => VesktopNative.app.openUpdater()} variant="secondary">
                Open Updater
            </Button>
        </div>
    );
}
