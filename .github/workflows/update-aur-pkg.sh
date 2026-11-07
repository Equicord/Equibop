#!/usr/bin/bash
set -euo pipefail

if [[ -n "${AUR_SSH_PRIVATE_KEY:-}" ]]; then HAS_KEY=1; else HAS_KEY=0; fi

set -x

if [[ -z "$RELEASE_TAG" ]]; then
    RELEASE_TAG=$(curl -fsSL https://api.github.com/repos/Equicord/Equibop/releases/latest | jq -r .tag_name)
fi
VERSION="${RELEASE_TAG#v}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid release tag: $RELEASE_TAG"
    exit 1
fi

cd ~

if [[ "$HAS_KEY" == 1 ]]; then
    install -d -m 0700 ~/.ssh
    # don't print the key via xtrace
    { set +x; } 2>/dev/null
    printf '%s\n' "$AUR_SSH_PRIVATE_KEY" > ~/.ssh/aur
    unset AUR_SSH_PRIVATE_KEY
    set -x
    chmod 0600 ~/.ssh/aur
    cat > ~/.ssh/config <<'EOF'
Host aur.archlinux.org
    User aur
    IdentityFile ~/.ssh/aur
    IdentitiesOnly yes
EOF
    chmod 0600 ~/.ssh/config
    ssh-keyscan aur.archlinux.org >> ~/.ssh/known_hosts
    chmod 0600 ~/.ssh/known_hosts

    git clone "ssh://aur@aur.archlinux.org/$PACKAGE.git" aur
else
    git clone "https://aur.archlinux.org/$PACKAGE.git" aur
fi

cd aur

current_version=$(sed -n 's/^pkgver=//p' PKGBUILD)
if [[ "$current_version" != "$VERSION" ]]; then
    sed -i "s/^pkgver=.*/pkgver=$VERSION/; s/^pkgrel=.*/pkgrel=1/" PKGBUILD
fi

updpkgsums
makepkg --printsrcinfo > .SRCINFO

# Source packages take long to build, so only make sure their sources download & verify
if [[ "$PACKAGE" == *-bin ]]; then
    makepkg --syncdeps --noconfirm
else
    makepkg --verifysource --noconfirm
fi

git add PKGBUILD .SRCINFO

if git diff --cached --quiet; then
    echo "AUR package is already up to date"
    exit 0
fi

if [[ "$EVENT_NAME" == workflow_dispatch ]]; then
    echo "Skipping push for workflow dispatch"
    git diff --cached
    exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git commit -m "Update $PACKAGE to $RELEASE_TAG"
git push
