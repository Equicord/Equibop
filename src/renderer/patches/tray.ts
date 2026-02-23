/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { onceReady } from "@equicord/types/webpack";
import { FluxDispatcher, MediaEngineStore, UserStore } from "@equicord/types/webpack/common";
import { Settings } from "renderer/settings";

import { setBadge } from "../appBadge";

type TrayVariant = "tray" | "trayUnread" | "traySpeaking" | "trayIdle" | "trayMuted" | "trayDeafened";

let isInCall = false;
let callStartTime: number | null = null;

export function getCallStartTime(): number | null {
    return callStartTime;
}

let currentVariant: TrayVariant | null = null;
let lastSentVariant: TrayVariant | null = null;
let trayStateUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

const subscriptions: Array<{ event: string; callback: (data: any) => void }> = [];

function getTrayVariantForVoiceState(): TrayVariant | null {
    if (!isInCall) return null;

    if (MediaEngineStore.isSelfDeaf()) return "trayDeafened";
    if (MediaEngineStore.isSelfMute()) return "trayMuted";
    return "trayIdle";
}

function updateTrayIcon() {
    const newVariant = getTrayVariantForVoiceState();

    if (newVariant === currentVariant) return;
    currentVariant = newVariant;

    if (trayStateUpdateTimeout) return;

    // debounce
    trayStateUpdateTimeout = setTimeout(() => {
        trayStateUpdateTimeout = null;

        if (!currentVariant || currentVariant === lastSentVariant) return;
        lastSentVariant = currentVariant;
        VesktopNative.tray.setVoiceState(currentVariant);
    }, 100);
}

function clearTrayStateDebounce() {
    if (!trayStateUpdateTimeout) return;
    clearTimeout(trayStateUpdateTimeout);
    trayStateUpdateTimeout = null;
}

function resetTrayStateTracking() {
    clearTrayStateDebounce();
    currentVariant = null;
    lastSentVariant = null;
}

function setTrayVariantImmediately(variant: TrayVariant) {
    if (currentVariant === variant && lastSentVariant === variant) return;

    currentVariant = variant;
    clearTrayStateDebounce();

    if (lastSentVariant !== variant) {
        lastSentVariant = variant;
        VesktopNative.tray.setVoiceState(variant);
    }
}

export function cleanupTraySubscriptions() {
    clearTrayStateDebounce();
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
                setTrayVariantImmediately("traySpeaking");
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
                callStartTime = Date.now();
                VesktopNative.tray.setVoiceCallState(true);
                updateTrayIcon();
            } else if (params.state === "RTC_DISCONNECTED") {
                isInCall = false;
                callStartTime = null;
                resetTrayStateTracking();
                VesktopNative.tray.setVoiceCallState(false);
                if (Settings.store.appBadge) setBadge();
                else VesktopNative.app.setBadgeCount(0);
            }
        }
    };
    FluxDispatcher.subscribe("RTC_CONNECTION_STATE", rtcCallback);
    subscriptions.push({ event: "RTC_CONNECTION_STATE", callback: rtcCallback });
});
