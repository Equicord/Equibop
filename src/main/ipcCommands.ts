/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "crypto";
import { ipcMain } from "electron";
import { IpcEvents } from "shared/IpcEvents";

import { mainWin } from "./mainWindow";

const DEFAULT_TIMEOUT_MS = 30000;

interface ResolverEntry {
    resolve: (data: unknown) => void;
    reject: (data: unknown) => void;
    timer: NodeJS.Timeout;
}

const resolvers = new Map<string, ResolverEntry>();

export interface IpcMessage {
    nonce: string;
    message: string;
    data?: unknown;
}

export interface IpcResponse {
    nonce: string;
    ok: boolean;
    data?: unknown;
}

/**
 * Sends a message to the renderer process and waits for a response.
 * `data` must be serializable as it will be sent over IPC.
 *
 * You must add a handler for the message in the renderer process.
 */
export function sendRendererCommand<T = unknown>(
    message: string,
    data?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
    if (!mainWin || mainWin.isDestroyed()) {
        console.warn("Main window is destroyed or not available, cannot send IPC command:", message);
        return Promise.reject(new Error("Main window is destroyed"));
    }

    const nonce = randomUUID();

    const promise = new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            resolvers.delete(nonce);
            reject(new Error(`IPC command "${message}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        resolvers.set(nonce, {
            resolve: resolve as (data: unknown) => void,
            reject,
            timer
        });
    });

    mainWin.webContents.send(IpcEvents.IPC_COMMAND, { nonce, message, data });

    return promise;
}

ipcMain.on(IpcEvents.IPC_COMMAND, (_event, { nonce, ok, data }: IpcResponse) => {
    const resolver = resolvers.get(nonce);
    if (!resolver) {
        console.warn("Received IPC response for unknown or timed-out command:", nonce);
        return;
    }

    clearTimeout(resolver.timer);

    if (ok) {
        resolver.resolve(data);
    } else {
        resolver.reject(data);
    }

    resolvers.delete(nonce);
});
