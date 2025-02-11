/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import dbus from "@homebridge/dbus-native";

let sessionBus: dbus.MessageBus | null;

export function getSessionBus(): dbus.MessageBus {
    if (!sessionBus) sessionBus = dbus.sessionBus();
    return sessionBus;
}

export { dbus };
