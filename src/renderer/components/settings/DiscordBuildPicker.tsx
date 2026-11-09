/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Margins, Paragraph } from "@equicord/types/components";
import { useAwaiter } from "@equicord/types/utils";
import { Select, useEffect, useState } from "@equicord/types/webpack/common";
import type { AssetDownloadStatus } from "main/discordBuild";

import { SimpleErrorBoundary } from "../SimpleErrorBoundary";
import { SettingsComponent } from "./Settings";
import { VesktopSettingsSwitch } from "./VesktopSettingsSwitch";

function AssetStatus() {
    const [status, setStatus] = useState<AssetDownloadStatus>();

    useEffect(() => {
        const update = () => VesktopNative.app.getDiscordBuildAssetStatus().then(setStatus);
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, []);

    if (!status?.total) return null;

    const failed = status.failed ? `, ${status.failed} failed` : "";
    return (
        <Paragraph>
            {status.running
                ? `Downloading build ${status.build}: ${status.done} of ${status.total} files${failed}`
                : `Saved ${status.done - status.failed} of ${status.total} files of build ${status.build}${failed}`}
        </Paragraph>
    );
}

export const DiscordBuildPicker: SettingsComponent = ({ settings }) => {
    const [builds] = useAwaiter(VesktopNative.app.getDiscordBuilds, { fallbackValue: [] });
    const running: string | undefined = (window as any).GLOBAL_ENV?.BUILD_NUMBER;

    return (
        <SimpleErrorBoundary>
            <div>
                <Paragraph className={Margins.bottom8}>
                    Pin a saved Discord build to stop Discord from updating. Equibop saves each new build it loads.
                    Changing this reloads Discord.
                </Paragraph>
                <Select
                    placeholder="Latest"
                    options={[
                        { label: "Latest (auto-update)", value: "", default: true },
                        ...builds.map(({ build, savedAt }) => ({
                            label: `${build}${build === running ? " (running)" : ""}, saved ${new Date(savedAt).toLocaleDateString()}`,
                            value: build
                        }))
                    ]}
                    closeOnSelect={true}
                    select={v => (settings.pinnedDiscordBuild = v || undefined)}
                    isSelected={v => v === (settings.pinnedDiscordBuild ?? "")}
                    serialize={s => s}
                />
            </div>
            <VesktopSettingsSwitch
                title="Download all files of the pinned build"
                description="Saves every Discord script of the pinned build so it keeps working if Discord removes them."
                value={!!settings.discordBuildAssets}
                onChange={v => (settings.discordBuildAssets = v)}
                disabled={!settings.pinnedDiscordBuild}
            />
            {settings.discordBuildAssets && settings.pinnedDiscordBuild && <AssetStatus />}
        </SimpleErrorBoundary>
    );
};
