/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./themedSplash";
import "./ipcCommands";
import "./appBadge";
import "./patches";
import "./fixes";
import "./arrpc";

export * as Components from "./components";
import { findByPropsLazy, onceReady } from "@vencord/types/webpack";
import { Alerts } from "@vencord/types/webpack/common";

import SettingsUi from "./components/settings/Settings";
import { Settings } from "./settings";
export { Settings };

const customSettingsSections = (
    Vencord.Plugins.plugins.Settings as any as { customSections: ((ID: Record<string, unknown>) => any)[] }
).customSections;

customSettingsSections.push(() => ({
    section: "Equibop",
    label: "Equibop Settings",
    element: SettingsUi,
    className: "vc-vesktop-settings"
}));

const VoiceActions = findByPropsLazy("toggleSelfMute");
VesktopNative.voice.onToggleSelfMute(() => VoiceActions.toggleSelfMute());
VesktopNative.voice.onToggleSelfDeaf(() => VoiceActions.toggleSelfDeaf());

// TODO: remove soon
const vencordDir = "vencordDir" as keyof typeof Settings.store;
if (Settings.store[vencordDir]) {
    onceReady.then(() =>
        setTimeout(
            () =>
                Alerts.show({
                    title: "Custom Equicord Location",
                    body: "Due to security hardening changes in Equibop, your custom Equicord location had to be reset. Please configure it again in the settings.",
                    onConfirm: () => delete Settings.store[vencordDir]
                }),
            5000
        )
    );
}
