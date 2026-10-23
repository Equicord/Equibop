/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addPatch } from "./shared";

addPatch({
    patches: [
        {
            find: "ApplicationStreamPreviewUploadManager",
            replacement: {
                // Thumbnail generation plays the shared stream in a temporary video.
                // Mute the element before attaching audio-bearing streams, without
                // disabling the audio track that is being sent to viewers.
                match: /(\i)\.srcObject=(\i),\1\.play\(\)/,
                replace: "$1.muted=true,$1.srcObject=$2,$1.play()"
            }
        }
    ]
});
