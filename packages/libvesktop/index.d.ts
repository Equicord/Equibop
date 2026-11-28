export function requestBackground(autoStart: boolean, commandLine: string[]): boolean;
export function isStatusNotifierHostRegistered(): boolean;

export interface MenuItem {
    id: number;
    label?: string;
    enabled?: boolean;
    visible?: boolean;
    type?: "separator";
}

export function initStatusNotifierItem(): boolean;
export function setStatusNotifierIcon(pixmapData: Buffer): boolean;
export function setStatusNotifierTitle(title: string): boolean;
export function setStatusNotifierMenu(items: MenuItem[]): boolean;
export function updateStatusNotifierMenuItem(id: number, label: string): boolean;
export function setStatusNotifierMenuClickCallback(callback: (id: number) => void): boolean;
export function setStatusNotifierActivateCallback(callback: () => void): boolean;
export function destroyStatusNotifierItem(): void;

export function registerHostApp(appId: string): boolean;
export function openGnomeAppSettings(appId: string): boolean;

export interface XDPShortcut {
    id: string;
    description: string;
}

export interface XDPBoundShortcut extends XDPShortcut {
    trigger: string;
}

export type XDPGlobalShortcutsEvent =
    | [event: "version", version: number]
    | [event: "ready"]
    | [event: "fatal", message: string]
    | [event: "error", message: string]
    | [event: "shortcuts", shortcuts: XDPBoundShortcut[]]
    | [event: "shortcut", id: string, pressed: boolean];

export class XDPGlobalShortcuts {
    constructor(onEvent: (...args: XDPGlobalShortcutsEvent) => void);

    bindShortcuts(shortcuts: XDPShortcut[]): void;
    configureShortcuts(): void;
    destroy(): void;
}
