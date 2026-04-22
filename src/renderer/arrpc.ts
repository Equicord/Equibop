/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@equicord/types/utils";
import { findLazy, onceReady } from "@equicord/types/webpack";
import {
    ApplicationAssetUtils,
    fetchApplicationsRPC,
    FluxDispatcher,
    InviteActions,
    StreamerModeStore
} from "@equicord/types/webpack/common";
import { IpcCommands } from "shared/IpcEvents";

import { onIpcCommand } from "./ipcCommands";

const logger = new Logger("EquibopRPC", "#5865f2");

interface RPCApplication {
    id: string;
    name: string;
    icon: string | null;
    description: string;
}

interface ActivityAssets {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
}

interface Activity {
    application_id: string;
    name?: string;
    details?: string;
    state?: string;
    assets?: ActivityAssets;
    timestamps?: {
        start?: number;
        end?: number;
    };
    buttons?: string[];
}

interface ActivityEvent {
    socketId?: string;
    activity: Activity | null;
}

async function lookupAsset(applicationId: string, key: string): Promise<string | undefined> {
    try {
        const assets = await ApplicationAssetUtils.fetchAssetIds(applicationId, [key]);
        return assets?.[0];
    } catch (e) {
        logger.warn(`Failed to lookup asset ${key} for ${applicationId}:`, e);
        return undefined;
    }
}

const APP_CACHE_MAX = 50;
const appCache = new Map<string, RPCApplication>();

async function lookupApp(applicationId: string): Promise<RPCApplication | undefined> {
    const cached = appCache.get(applicationId);
    if (cached) {
        appCache.delete(applicationId);
        appCache.set(applicationId, cached);
        return cached;
    }

    try {
        const socket: { application?: RPCApplication } = {};
        await fetchApplicationsRPC(socket, applicationId);

        if (socket.application) {
            if (appCache.size >= APP_CACHE_MAX) {
                const oldest = appCache.keys().next().value;
                if (oldest) appCache.delete(oldest);
            }
            appCache.set(applicationId, socket.application);
            return socket.application;
        }
    } catch (e) {
        logger.warn(`Failed to lookup app ${applicationId}:`, e);
    }

    return undefined;
}

async function handleActivityEvent(data: ActivityEvent) {
    const { activity } = data;

    if (data.socketId === "STREAMERMODE" || activity?.application_id === "STREAMERMODE") {
        if (StreamerModeStore.autoToggle) {
            const shouldEnable = activity != null;
            logger.info(`Toggling streamer mode: ${shouldEnable ? "ON" : "OFF"}`);
            FluxDispatcher.dispatch({
                type: "STREAMER_MODE_UPDATE",
                key: "enabled",
                value: shouldEnable
            });
        }
        return;
    }

    if (activity) {
        const { assets } = activity;
        if (assets?.large_image) assets.large_image = await lookupAsset(activity.application_id, assets.large_image);
        if (assets?.small_image) assets.small_image = await lookupAsset(activity.application_id, assets.small_image);

        const app = await lookupApp(activity.application_id);
        if (app) activity.name ||= app.name;
    }

    FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", ...data });
}

// Listen for activity events from main process
VesktopNative.arrpc.onActivity(async (data: ActivityEvent) => {
    await onceReady;
    handleActivityEvent(data);
});

logger.info("arRPC bridge initialized (main process handles connection)");

onIpcCommand(IpcCommands.RPC_INVITE, async code => {
    const { invite } = await InviteActions.resolveInvite(code, "Desktop Modal");
    if (!invite) return false;

    VesktopNative.win.focus();

    FluxDispatcher.dispatch({
        type: "INVITE_MODAL_OPEN",
        invite,
        code,
        context: "APP"
    });

    return true;
});

const { DEEP_LINK } = findLazy(m => m.DEEP_LINK?.handler);

onIpcCommand(IpcCommands.RPC_DEEP_LINK, async data => {
    logger.debug("Opening deep link:", data);
    try {
        DEEP_LINK.handler({ args: data });
        return true;
    } catch (err) {
        logger.error("Failed to open deep link:", err);
        return false;
    }
});
