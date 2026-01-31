/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SettingsRouter } from "@equicord/types/webpack/common";
import { IpcCommands } from "shared/IpcEvents";

import { openScreenSharePicker } from "./components/ScreenSharePicker";
import { callStartTime } from "./patches/tray";

type IpcCommandHandler = (data: any) => any;

const handlers = new Map<string, IpcCommandHandler>();

function respond(nonce: string, ok: boolean, data: any) {
    VesktopNative.commands.respond({ nonce, ok, data });
}

VesktopNative.commands.onCommand(async ({ message, nonce, data }) => {
    const handler = handlers.get(message);
    if (!handler) {
        return respond(nonce, false, `No handler for message: ${message}`);
    }

    try {
        const result = await handler(data);
        respond(nonce, true, result);
    } catch (err) {
        respond(nonce, false, String(err));
    }
});

export function onIpcCommand(channel: string, handler: IpcCommandHandler) {
    if (handlers.has(channel)) {
        throw new Error(`Handler for message ${channel} already exists`);
    }

    handlers.set(channel, handler);
}

export function offIpcCommand(channel: string) {
    handlers.delete(channel);
}

/* Generic Handlers */

onIpcCommand(IpcCommands.NAVIGATE_SETTINGS, () => {
    SettingsRouter.open("My Account");
});

onIpcCommand(IpcCommands.GET_LANGUAGES, () => navigator.languages);

onIpcCommand(IpcCommands.SCREEN_SHARE_PICKER, data => openScreenSharePicker(data.screens, data.skipPicker));

onIpcCommand(IpcCommands.QUERY_IS_IN_CALL, () => {
    try {
        const VoiceStateStore = Vencord.Webpack.findStore("VoiceStateStore");
        const UserStore = Vencord.Webpack.findStore("UserStore");

        const currentUserId = UserStore.getCurrentUser()?.id;
        if (!currentUserId)
            return "false";

        const voiceState = VoiceStateStore.getVoiceStateForUser(currentUserId);
        return voiceState?.channelId ? "true" : "false";
    } catch {
        return "false";
    }
});

onIpcCommand(IpcCommands.QUERY_VOICE_CHANNEL_NAME, () => {
    try {
        const VoiceStateStore = Vencord.Webpack.findStore("VoiceStateStore");
        const UserStore = Vencord.Webpack.findStore("UserStore");
        const ChannelStore = Vencord.Webpack.findStore("ChannelStore");

        const currentUser = UserStore.getCurrentUser();
        if (!currentUser?.id)
            return "Not in call";

        const voiceState = VoiceStateStore.getVoiceStateForUser(currentUser.id);
        if (!voiceState?.channelId)
            return "Not in call";

        const channel = ChannelStore.getChannel(voiceState.channelId);
        if (!channel)
            return "Not in call";

        // Guild voice channel - use channel name
        if (channel.guild_id)
            return channel.name;

        // DM call - show the other user's name
        if (channel.type === 1) {
            const recipientId = channel.recipients?.find((id: string) => id !== currentUser.id);
            
            if (recipientId) {
                const recipient = UserStore.getUser(recipientId);
                if (recipient)
                    return recipient.globalName || recipient.username;
            }

            return channel.name || "DM Call";
        }

        // Group DM call - use the group name or fallback to recipient names
        if (channel.type === 3) {
            if (channel.name)
                return channel.name;

            const names = channel.recipients
                ?.map((id: string) => {
                    const user = UserStore.getUser(id);
                    return user?.globalName || user?.username;
                })
                .filter(Boolean);

            return names?.length ? names.join(", ") : "Group Call";
        }

        return channel.name || "Not in call";
    } catch {
        return "Not in call";
    }
});

onIpcCommand(IpcCommands.QUERY_CALL_DURATION, () => {
    if (callStartTime == null)
        return "Not in call";

    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;

    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");

    if (hours > 0) {
        const hh = String(hours).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
    }

    return `${mm}:${ss}`;
});
