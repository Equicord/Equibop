/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./start";

import { spawn } from "child_process";
spawn("bun", ["run", "scripts/build/build.mts", "--watch", "--dev"], { stdio: "inherit" });
