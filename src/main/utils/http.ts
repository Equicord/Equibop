/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { closeSync, createWriteStream, fsyncSync, mkdirSync, openSync } from "original-fs";
import { dirname } from "path";
import { Millis } from "shared/utils/millis";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { setTimeout } from "timers/promises";

interface FetchieOptions {
    retryOnNetworkError?: boolean;
}

export async function downloadFile(url: string, file: string, options: RequestInit = {}, fetchieOpts?: FetchieOptions) {
    const res = await fetchie(url, options, fetchieOpts);

    mkdirSync(dirname(file), { recursive: true });

    const writeStream = createWriteStream(file, { autoClose: false });
    const closeStream = () => new Promise<void>(r => writeStream.close(() => r()));

    try {
        await pipeline(
            // @ts-expect-error odd type error
            Readable.fromWeb(res.body!),
            writeStream
        );
        await closeStream();
        const fd = openSync(file, "r");
        fsyncSync(fd);
        closeSync(fd);
    } catch (err) {
        await closeStream();
        throw err;
    }
}

export async function fetchie(url: string, options?: RequestInit, { retryOnNetworkError }: FetchieOptions = {}) {
    let res: Response | undefined;

    try {
        res = await fetch(url, options);
    } catch (err) {
        if (retryOnNetworkError) {
            console.error("Failed to fetch", url + ".", "Gonna retry with backoff.");

            for (let tries = 0, delayMs = 500; tries < 20; tries++, delayMs = Math.min(2 * delayMs, Millis.MINUTE)) {
                await setTimeout(delayMs);
                try {
                    res = await fetch(url, options);
                    break;
                } catch {}
            }
        }

        if (!res) throw new Error(`Failed to fetch ${url}\n${err}`);
    }

    if (res.ok) return res;

    let msg = `Got non-OK response for ${url}: ${res.status} ${res.statusText}`;

    const reason = await res.text().catch(() => "");
    if (reason) msg += `\n${reason}`;

    throw new Error(msg);
}
