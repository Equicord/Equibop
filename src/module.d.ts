/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

declare module "__patches__" {
    const never: never;
    export default never;
}

declare module "@vencord/venmic" {
    export interface Node {
        [key: string]: string;
    }

    export interface LinkData {
        include: Node[];
        exclude: Node[];
        ignore_devices?: boolean;
        only_speakers?: boolean;
        only_default_speakers?: boolean;
        workaround?: Node[];
    }

    export class PatchBay {
        static hasPipeWire(): boolean;
        list(props?: string[]): Node[];
        link(data: LinkData): boolean;
        unlink(): boolean;
    }
}
