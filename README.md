# Equibop [<img src="/static/icon.png" width="225" align="right" alt="Equibop">](https://github.com/Equicord/Equibop)

[![Equicord](https://img.shields.io/badge/Equicord-grey?style=flat)](https://github.com/Equicord/Equicord)
[![Tests](https://github.com/Equicord/Equibop/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/Equicord/Equibop/actions/workflows/test.yml)
[![Discord](https://img.shields.io/discord/1173279886065029291.svg?color=768AD4&label=Discord&logo=discord&logoColor=white)](https://equicord.org/discord)

Equibop is a fork of [Vesktop](https://github.com/Vencord/Vesktop).

You can join our [discord server](https://equicord.org/discord) for commits, changes, chat or even support.<br></br>

**Main features**:
- Equicord preinstalled
- Much more lightweight and faster than the official Discord app
- Linux Screenshare with sound & wayland
- Much better privacy, since Discord has no access to your system

**Extra included changes**

- Tray Customization with voice detection and notification badges
- Command-line flags to toggle microphone and deafen status (Linux)
- Custom Arguments from [this PR](https://github.com/Equicord/Equibop/pull/46)
- arRPC-bun with debug logging support https://github.com/Creationsss/arrpc-bun

**Linux Note**:

- You can use the `--toggle-mic` & `--toggle-deafen` flags to toggle your microphone and deafen status from the terminal. These can be bound to keyboard shortcuts at the system level.

**Not fully Supported**:
- Global Keybinds (Windows/macOS - use command-line flags on Linux instead)

# Equibop Arguments

### Runtime Flags
These flags can be passed when launching the application  
(or via `Settings > Equibop Settings > Arguments > Configure`):

```bash
--wayland
```
> Forces the application to use the **Ozone Wayland** platform.  
> Automatically enables:  
> • `WaylandWindowDecorations`  
> • `VaapiVideoDecodeLinuxGL` (hardware acceleration)

**Alternative (basic Wayland):**
```bash
--enable-features=UseOzonePlatform --ozone-platform=wayland
```

```bash
--no-sandbox
```
> Disables the Chromium sandbox.  
> Commonly used when the application is executed as root.

```bash
--force_high_performance_gpu
```
> Instructs the engine to prioritize the discrete (high-performance) GPU.

### Development and Build Arguments
These arguments are parsed during the build process:

```bash
--dev
```
> Enables development mode.  
> • Disables code minification  
> • Sets `IS_DEV` to `true`

```bash
--watch
```
> Starts a persistent build context that monitors file changes  
> and triggers automatic rebuilds.

### Persistent Configuration File
The launcher supports a flags file located at:

```
${XDG_CONFIG_HOME}/equibop-flags.conf
```

**Rules:**
- Empty lines are ignored
- Lines starting with `#` are treated as comments
- Valid entries are appended to the execution command

## Installing
Check the [Releases](https://github.com/Equicord/Equibop/releases) page

OR

Check The Downloads from the [website](https://equicord.org/download)

### Linux

[![Equibop](https://img.shields.io/badge/AVAILABLE_ON_THE_AUR-333232?style=for-the-badge&logo=arch-linux&logoColor=0F94D2&labelColor=%23171717)](https://aur.archlinux.org/packages?O=0&K=equibop)
<br>
<!-- <a href="https://flathub.org/apps/io.github.equicord.equibop">
  <img src="https://flathub.org/api/badge?svg" alt="Download on Flathub" style="width:220px; height:auto;">
</a> -->

#### Community packages

Below you can find unofficial packages created by the community. They are not officially supported by us, so before reporting issues, please first confirm the issue also happens on official builds. When in doubt, consult with their packager first. The AppImage should work on any distro that supports them, so I recommend you just use that instead!

- Arch Linux: [Equibop on the Arch user repository](https://aur.archlinux.org/packages?K=equibop)
- NixOS: `nix-shell -p equibop`

## Building from Source

You need to have the following dependencies installed:
- [Git](https://git-scm.com/downloads)
- [Bun](https://bun.sh)

Packaging will create builds in the dist/ folder

```sh
git clone https://github.com/Equicord/Equibop
cd Equibop

# Install Dependencies
bun install

# Either run it without packaging
bun start

# Or package (will build packages for your OS)
bun package

# Or only build the Linux Pacman package
bun package --linux pacman

# Or package to a directory only
bun package:dir
```

## Building LibVesktop from Source

This is a small C++ helper library Equibop uses on Linux to emit D-Bus events. By default, prebuilt binaries for x64 and arm64 are used.

If you want to build it from source:
1. Install build dependencies:
    - Debian/Ubuntu: `apt install build-essential python3 curl pkg-config libglib2.0-dev`
    - Fedora: `dnf install @c-development @development-tools python3 curl pkgconf-pkg-config glib2-devel`
2. Run `bun buildLibVesktop`
3. From now on, building Equibop will use your own build
