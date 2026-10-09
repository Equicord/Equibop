import { cpSync, existsSync } from "fs";
import { basename, join, resolve } from "path";

function applySignedWindowsApp(context) {
    const signedDir = process.env.SIGNED_WIN_DIR;
    if (!signedDir || context.electronPlatformName !== "win32") return;

    const signedAppDir = join(resolve(signedDir), basename(context.appOutDir));
    if (!existsSync(signedAppDir)) {
        throw new Error(`SIGNED_WIN_DIR is set but ${signedAppDir} does not exist`);
    }

    console.log(`Applying signed Windows app: ${signedAppDir} -> ${context.appOutDir}`);
    cpSync(signedAppDir, context.appOutDir, { recursive: true, force: true });
}

export default async function afterSign(context) {
    applySignedWindowsApp(context);
}
