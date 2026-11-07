/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, Paragraph, TextButton } from "@equicord/types/components";
import { Heading } from "@equicord/types/components/Heading";
import { Margins, promptToRestart, useForceUpdater } from "@equicord/types/utils";
import { Modal, openModal, showToast } from "@equicord/types/webpack/common";
import { Settings } from "shared/settings";

import { cl, SettingsComponent } from "./Settings";

export const DeveloperOptionsButton: SettingsComponent = ({ settings }) => {
    return <Button onClick={() => openDeveloperOptionsModal(settings)}>Open Developer Settings</Button>;
};

function openDeveloperOptionsModal(settings: Settings) {
    openModal(props => (
        <Modal {...props} size="md" title="Equibop Developer Options">
            <div style={{ padding: "1em 0" }}>
                <Heading tag="h5">Equicord Location</Heading>
                <EquicordLocationPicker settings={settings} />

                <Heading tag="h5" className={Margins.top16}>
                    Debugging
                </Heading>
                <div className={cl("button-grid")}>
                    <Button onClick={() => VesktopNative.debug.launchGpu()}>Open chrome://gpu</Button>
                    <Button onClick={() => VesktopNative.debug.launchWebrtcInternals()}>
                        Open chrome://webrtc-internals
                    </Button>
                </div>
            </div>
        </Modal>
    ));
}

const EquicordLocationPicker: SettingsComponent = () => {
    const forceUpdate = useForceUpdater();
    const usingCustomEquicordDir = VesktopNative.fileManager.isUsingCustomVencordDir();

    return (
        <>
            <Paragraph>
                Equicord files are loaded from{" "}
                {usingCustomEquicordDir ? (
                    <TextButton
                        variant="link"
                        onClick={e => {
                            e.preventDefault();
                            VesktopNative.fileManager.showCustomVencordDir();
                        }}
                    >
                        a custom location
                    </TextButton>
                ) : (
                    "the default location"
                )}
            </Paragraph>
            <div className={cl("button-grid")}>
                <Button
                    size={"small"}
                    onClick={async () => {
                        const choice = await VesktopNative.fileManager.selectEquicordDir();
                        switch (choice) {
                            case "cancelled":
                                break;
                            case "ok":
                                promptToRestart("relaunch");
                                break;
                            case "invalid":
                                showToast({
                                    text: "You did not choose a valid Equicord install. Make sure you're selecting the dist dir!",
                                    variant: "critical"
                                });
                                break;
                        }
                        forceUpdate();
                    }}
                >
                    Change
                </Button>
                <Button
                    size={"small"}
                    variant="dangerPrimary"
                    onClick={async () => {
                        await VesktopNative.fileManager.selectEquicordDir(null);
                        forceUpdate();
                    }}
                >
                    Reset
                </Button>
            </div>
        </>
    );
};
