/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@equicord/types/components";

import { SettingsComponent } from "./Settings";

export const ArRPCSettingsButton: SettingsComponent = () => {
    return <Button onClick={() => VesktopNative.arrpc.openSettings()}>Configure Rich Presence</Button>;
};
