/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function promiseWithTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T>;
export function promiseWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null>;
export function promiseWithTimeout<T>(promise: Promise<T>, ms: number, fallback?: T): Promise<T | null> {
    const timeoutPromise = new Promise<T | null>(resolve => {
        setTimeout(() => resolve(fallback ?? null), ms);
    });
    return Promise.race([promise, timeoutPromise]);
}

export function rejectAfterTimeout(ms: number, message = "Operation timed out"): Promise<never> {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), ms);
    });
}
