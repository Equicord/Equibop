/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SettingsRouter } from "@equicord/types/webpack/common";
import { IpcCommands } from "shared/IpcEvents";

import { openScreenSharePicker } from "./components/ScreenSharePicker";

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
