/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./settings.css";

import { classNameFactory } from "@equicord/types/api/Styles";
import { BaseText, Divider, ErrorBoundary } from "@equicord/types/components";
import { ComponentType } from "react";
import { getValueAndOnChange, Settings, useSettings } from "renderer/settings";
import { isMac } from "renderer/utils";

import { ArRPCSettingsButton } from "./ArRPCSettings";
import { AutoStartToggle } from "./AutoStartToggle";
import { DeveloperOptionsButton } from "./DeveloperOptions";
import { DiscordBranchPicker } from "./DiscordBranchPicker";
import { NotificationBadgeToggle } from "./NotificationBadgeToggle";
import { OutdatedVesktopWarning } from "./OutdatedVesktopWarning";
import { Updater } from "./Updater";
import { UserAssetsButton } from "./UserAssets";
import { VesktopSettingsSwitch } from "./VesktopSettingsSwitch";
import { WebRTCIPHandlingPolicyPicker } from "./WebRTCIPHandlingPolicyPicker";
import { WindowsTransparencyControls } from "./WindowsTransparencyControls";

interface BooleanSetting {
    key: keyof typeof Settings.store;
    title: string;
    description: string;
    disabled?(): boolean;
    invisible?(): boolean;
}

export const cl = classNameFactory("vcd-settings-");

export type SettingsComponent = ComponentType<{ settings: typeof Settings.store }>;

const SettingsOptions: Record<string, Array<BooleanSetting | SettingsComponent>> = {
    "Discord Branch": [DiscordBranchPicker],
    "System Startup & Performance": [
        AutoStartToggle,
        {
            key: "hardwareAcceleration",
            title: "Hardware Acceleration",
            description: "Enable hardware acceleration"
        },
        {
            key: "hardwareVideoAcceleration",
            title: "Video Hardware Acceleration",
            description:
                "Enable hardware video acceleration. This can improve performance of screenshare and video playback, but may cause graphical glitches and infinitely loading streams.",
            disabled: () => !Settings.store.hardwareAcceleration
        }
    ],
    "User Interface": [
        {
            key: "nativeTitleBar",
            title: "Native Titlebar",
            description: "Enable the system titlebar in addition to Discord's custom one. Requires a full restart."
        },
        {
            key: "staticTitle",
            title: "Static Title",
            description: 'Makes the window title "Equibop" instead of changing to the current page'
        },
        {
            key: "enableMenu",
            title: "Enable Menu Bar",
            description: "Enables the application menu bar. Press ALT to toggle visibility.",
            disabled: () => !Settings.store.nativeTitleBar
        },
        {
            key: "enableShadow",
            title: "Enable Window Shadow",
            description: "Enables the window shadow. Requires a full restart.",
            disabled: () => Settings.store.nativeTitleBar
        },
        {
            key: "enableRoundedCorners",
            title: "Enable Rounded Corners",
            description: "Enables rounded corners. Requires a full restart.",
            disabled: () => Settings.store.nativeTitleBar
        },
        {
            key: "enableSplashScreen",
            title: "Enable Splash Screen",
            description:
                "Shows a small splash screen while Equibop is loading. Disabling this option will show the main window earlier while it's still loading."
        },
        {
            key: "splashTheming",
            title: "Splash theming",
            description: "Adapt the splash window colors to your custom theme"
        },
        {
            key: "splashProgress",
            title: "Show progress bar in Splash",
            description: "Adds a fancy progress bar to the splash window"
        },
        WindowsTransparencyControls,
        UserAssetsButton
    ],
    Behaviour: [
        {
            key: "tray",
            title: "Tray Icon",
            description: "Add a tray icon for Equibop",
            invisible: () => isMac
        },
        {
            key: "minimizeToTray",
            title: "Minimize to tray",
            description: "Hitting X will make Equibop minimize to the tray instead of closing",
            invisible: () => isMac,
            disabled: () => !Settings.store.tray
        },
        {
            key: "clickTrayToShowHide",
            title: "Hide/Show on tray click",
            description: "Left clicking tray icon will toggle the Equibop window visibility."
        },
        {
            key: "disableMinSize",
            title: "Disable minimum window size",
            description: "Allows you to make the window as small as your heart desires"
        },
        {
            key: "disableSmoothScroll",
            title: "Disable smooth scrolling",
            description: "Disables smooth scrolling"
        }
    ],
    Notifications: [
        NotificationBadgeToggle,
        {
            key: "enableTaskbarFlashing",
            title: "Enable Taskbar Flashing",
            description: "Flashes the app in your taskbar when you have new notifications."
        }
    ],
    "Rich Presence": [ArRPCSettingsButton],
    Miscellaneous: [
        {
            key: "middleClickAutoscroll",
            title: "Middle Click Autoscroll",
            description: "Enables middle-click scrolling (Requires a full restart)"
        },
        {
            key: "openLinksWithElectron",
            title: "Open Links in app (experimental)",
            description: "Opens links in a new Equibop window instead of your web browser"
        },
        WebRTCIPHandlingPolicyPicker
    ],
    "Developer Options": [DeveloperOptionsButton]
};

function SettingsSections() {
    const Settings = useSettings();

    const sections = Object.entries(SettingsOptions).map(([title, settings], i, arr) => (
        <div key={title} className={cl("category")}>
            <BaseText size="lg" weight="semibold" tag="h3" className={cl("category-title")}>
                {title}
            </BaseText>

            <div className={cl("category-content")}>
                {settings.map((Setting, i) => {
                    if (typeof Setting === "function") return <Setting key={`Custom-${i}`} settings={Settings} />;

                    const { title, description, key, disabled, invisible } = Setting;
                    if (invisible?.()) return null;

                    return (
                        <VesktopSettingsSwitch
                            title={title}
                            description={description}
                            disabled={disabled?.()}
                            {...getValueAndOnChange(key)}
                            key={key}
                        />
                    );
                })}
            </div>

            {i < arr.length - 1 && <Divider className={cl("category-divider")} />}
        </div>
    ));

    return <>{sections}</>;
}

export default ErrorBoundary.wrap(
    function SettingsUI() {
        return (
            <section>
                <Updater />
                <OutdatedVesktopWarning />
                <SettingsSections />
            </section>
        );
    },
    {
        message:
            "Failed to render the Equibop Settings tab. If this issue persists, try to right click the Equibop tray icon, then click 'Repair Equicord'. And make sure your Equibop is up to date."
    }
);
