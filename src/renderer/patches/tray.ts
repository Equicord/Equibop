/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findStoreLazy, onceReady } from "@equicord/types/webpack";
import { FluxDispatcher, UserStore } from "@equicord/types/webpack/common";

import { setBadge } from "../appBadge";

const MediaEngineStore = findStoreLazy("MediaEngineStore");

type TrayVariant = "tray" | "trayUnread" | "traySpeaking" | "trayIdle" | "trayMuted" | "trayDeafened";

let isInCall = false;
let currentVariant: TrayVariant | null = null;

const subscriptions: Array<{ event: string; callback: (data: any) => void }> = [];

function getTrayVariantForVoiceState(): TrayVariant | null {
    if (!isInCall) return null;

    if (MediaEngineStore.isSelfDeaf()) return "trayDeafened";
    if (MediaEngineStore.isSelfMute()) return "trayMuted";
    return "trayIdle";
}

function updateTrayIcon() {
    const newVariant = getTrayVariantForVoiceState();

    if (newVariant !== currentVariant) {
        currentVariant = newVariant;

        if (newVariant) {
            VesktopNative.tray.setVoiceState(newVariant);
        }
    }
}

export function cleanupTraySubscriptions() {
    subscriptions.forEach(({ event, callback }) => {
        FluxDispatcher.unsubscribe(event, callback);
    });
    subscriptions.length = 0;
}

onceReady.then(() => {
    const userID = UserStore.getCurrentUser().id;

    const speakingCallback = (params: any) => {
        if (params.userId === userID && params.context === "default") {
            if (params.speakingFlags) {
                if (currentVariant !== "traySpeaking") {
                    currentVariant = "traySpeaking";
                    VesktopNative.tray.setVoiceState("traySpeaking");
                }
            } else {
                updateTrayIcon();
            }
        }
    };
    FluxDispatcher.subscribe("SPEAKING", speakingCallback);
    subscriptions.push({ event: "SPEAKING", callback: speakingCallback });

    const deafCallback = () => {
        if (isInCall) updateTrayIcon();
    };
    FluxDispatcher.subscribe("AUDIO_TOGGLE_SELF_DEAF", deafCallback);
    subscriptions.push({ event: "AUDIO_TOGGLE_SELF_DEAF", callback: deafCallback });

    const muteCallback = () => {
        if (isInCall) updateTrayIcon();
    };
    FluxDispatcher.subscribe("AUDIO_TOGGLE_SELF_MUTE", muteCallback);
    subscriptions.push({ event: "AUDIO_TOGGLE_SELF_MUTE", callback: muteCallback });

    const rtcCallback = (params: any) => {
        if (params.context === "default") {
            if (params.state === "RTC_CONNECTED") {
                isInCall = true;
                VesktopNative.tray.setVoiceCallState(true);
                updateTrayIcon();
            } else if (params.state === "RTC_DISCONNECTED") {
                isInCall = false;
                currentVariant = null;
                VesktopNative.tray.setVoiceCallState(false);
                setBadge();
            }
        }
    };
    FluxDispatcher.subscribe("RTC_CONNECTION_STATE", rtcCallback);
    subscriptions.push({ event: "RTC_CONNECTION_STATE", callback: rtcCallback });
});
