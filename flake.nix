{
  description = "Equibop is a custom Discord App aiming to give you better performance and improve linux support.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
      pkgsFor = system: import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };

      version = "3.1.9";
      
      hashes = {
        x86_64-linux = "sha256-40SUavhqhcYLxOfMnvv8OsP+58QWNLzhdEu0GmwLRp8=";
        aarch64-linux = "sha256-1suu4k9tCeeRfaMaw3Q+WNL17nxaJkIGodac1uhK1nU=";
      };

      srcs = forAllSystems (system:
        let
          suffix = if system == "x86_64-linux" then "" else "-arm64";
          pkgs = pkgsFor system;
        in
        pkgs.fetchurl {
          url = "https://github.com/Equicord/Equibop/releases/download/v${version}/equibop-${version}${suffix}.tar.gz";
          hash = hashes.${system};
        }
      );

      mkEquibop = system:
        let
          pkgs = pkgsFor system;
          src = srcs.${system};
          electron = pkgs.electron_40 or pkgs.electron;
        in
        pkgs.stdenv.mkDerivation {
          pname = "equibop";
          inherit version src;

          nativeBuildInputs = with pkgs; [
            makeWrapper
            copyDesktopItems
          ];

          buildInputs = with pkgs; [
            stdenv.cc.cc.lib
            libsecret
            libnotify
          ];

          desktopItems = [
            (pkgs.makeDesktopItem {
              name = "equibop";
              exec = "equibop %U";
              icon = "equibop";
              desktopName = "Equibop";
              genericName = "Internet Messenger";
              categories = [ "Network" "InstantMessaging" "Chat" ];
              keywords = [ "discord" "vencord" "electron" "chat" "equibop" ];
              mimeTypes = [ "x-scheme-handler/discord" ];
              startupWMClass = "equibop";
            })
          ];

          unpackPhase = ''
            runHook preUnpack
            
            mkdir -p source
            tar -xzf $src -C source --strip-components=1
            
            runHook postUnpack
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p $out/lib/equibop
            install -Dm755 source/resources/app.asar $out/lib/equibop/
            install -Dm755 source/resources/app-update.yml $out/lib/equibop/
            cp -r source/resources/arrpc $out/lib/equibop/

            mkdir -p $out/share/pixmaps
            install -Dm644 ${./static/icon.png} $out/share/pixmaps/equibop.png

            makeWrapper ${electron}/bin/electron $out/bin/equibop \
              --add-flags $out/lib/equibop/app.asar \
              --add-flags "--ozone-platform-hint=auto" \
              --prefix LD_LIBRARY_PATH : "${pkgs.lib.makeLibraryPath (with pkgs; [ stdenv.cc.cc.lib libsecret libnotify ])}" \
              --inherit-argv0

            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Equibop is a custom Discord App aiming to give you better performance and improve linux support.";
            homepage = "https://github.com/Equicord/Equibop";
            license = licenses.gpl3Only;
            platforms = [ "x86_64-linux" "aarch64-linux" ];
            mainProgram = "equibop";
          };
        };
    in
    {
      packages = forAllSystems (system: {
        default = mkEquibop system;
        equibop = mkEquibop system;
      });
    };
}
