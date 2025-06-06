{
  description = "Slusha - A Telegram bot built with Deno and TypeScript";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
  
    let
      src = ./.;

      # Cache all dependencies
      # - deno install --entrypoint caches all deps including JSR metadata  
      # - Pre-compile dummy script to cache denort runtime binary
      # - dontStrip = true preserves embedded JS section in final binary
      cacheDeps = pkgs: pkgs.stdenv.mkDerivation {
        name = "deno-deps-cache";
        inherit src;
        buildInputs = [ pkgs.deno ];

        buildPhase = ''
          export HOME=$(mktemp -d)
          export DENO_DIR=$HOME/.cache/deno
          
          deno install --allow-import --entrypoint main.ts
          
          # Pre-download the denort runtime binary by compiling a dummy script
          echo 'console.log("test");' > dummy.ts
          deno compile --allow-all --output dummy dummy.ts || true
          rm -f dummy dummy.ts
        '';

        installPhase = ''
          mkdir -p $out
          cp -r $HOME/.cache/deno $out/deno_cache
          cp -r vendor $out/vendor
        '';

        outputHashMode = "recursive";
        outputHashAlgo = "sha256";
        outputHash = "sha256-0VI5yfcIN1IPmlyCqpn9hO5D7KSkCmfb4t56TKDHN3k=";
      };

      buildSlusha = pkgs: pkgs.stdenv.mkDerivation rec {
        pname = "slusha";
        version = "0.1.0";

        inherit src;

        dontStrip = true;

        nativeBuildInputs = with pkgs; [
          deno
          patchelf
        ];

        buildInputs = with pkgs; [
          stdenv.cc.cc.lib
          glibc
          libgcc
          zlib
          openssl
        ];

        postFixup = ''
          # Don't patch the binary at all - any ELF modification corrupts the embedded JS
          # Instead, create a wrapper script that sets LD_LIBRARY_PATH
          
          echo "Original binary library dependencies:"
          ldd $out/bin/slusha || true
          
          mv $out/bin/slusha $out/bin/.slusha-wrapped
          
          # Create wrapper script that sets library path
          cat > $out/bin/slusha << EOF
#!${pkgs.bash}/bin/bash
set -e
# Set LD_LIBRARY_PATH to include nix store libraries
export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ 
  pkgs.stdenv.cc.cc.lib 
  pkgs.glibc 
  pkgs.libgcc 
  pkgs.zlib 
  pkgs.openssl 
]}:\$LD_LIBRARY_PATH"

# Execute the original binary
exec "\$(dirname "\$0")/.slusha-wrapped" "\$@"
EOF
          
          chmod +x $out/bin/slusha
          
          echo "Created wrapper script, testing..."
          if $out/bin/slusha --version 2>&1 | grep -q "Could not find standalone binary section"; then
            echo "ERROR: Binary still corrupted"
            exit 1
          else
            echo "Wrapper script works correctly"
          fi
        '';

        buildPhase = ''
          runHook preBuild
          
          export HOME=$(mktemp -d)
          export DENO_DIR=$HOME/.cache/deno
          
          # Create cache directory and copy cached dependencies from cacheDeps
          mkdir -p $HOME/.cache
          cp -r ${cacheDeps pkgs}/deno_cache $DENO_DIR
          
          # Copy vendor directory from cacheDeps
          cp -r ${cacheDeps pkgs}/vendor ./vendor
          
          # TODO: remove --no-check
          # TODO: remove --allow-all
          deno compile --allow-all --no-check --cached-only --output slusha main.ts
          
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          
          mkdir -p $out/bin
          cp slusha $out/bin/
          
          runHook postInstall
        '';

        meta = with pkgs.lib; {
          description = "A Telegram bot built with Deno and TypeScript";
          homepage = "https://github.com/sleroq/slusha";
          license = licenses.mit;
          maintainers = [ ];
          platforms = platforms.unix;
        };
      };
    in
    {
      nixosModules.slusha = { config, lib, pkgs, ... }:
        with lib;
        let
          cfg = config.services.slusha;
        in {
          options.services.slusha = {
            enable = mkEnableOption "Slusha Telegram bot";

            package = mkOption {
              type = types.package;
              default = buildSlusha pkgs;
              description = "The slusha package to use";
            };

            user = mkOption {
              type = types.str;
              default = "slusha";
              description = "User to run slusha as";
            };

            group = mkOption {
              type = types.str;
              default = "slusha";
              description = "Group to run slusha as";
            };

            dataDir = mkOption {
              type = types.str;
              default = "/var/lib/slusha";
              description = "Directory to store slusha data";
            };

            environmentFile = mkOption {
              type = types.nullOr types.str;
              default = null;
              description = "File containing environment variables";
            };

            configFile = mkOption {
              type = types.nullOr types.str;
              default = null;
              description = "Path to slusha configuration file";
            };

            configText = mkOption {
              type = types.nullOr types.str;
              default = null;
              description = "Slusha configuration as a string";
            };

            settings = mkOption {
              type = types.attrs;
              default = { };
              description = "Environment variables for slusha";
            };
          };

          config = mkIf cfg.enable (
            let
              configFile = if cfg.configText != null then
                pkgs.writeText "slusha.config.js" cfg.configText
              else if cfg.configFile != null then
                cfg.configFile
              else
                null;
            in {
              users.users.${cfg.user} = {
                isSystemUser = true;
                group = cfg.group;
                home = cfg.dataDir;
                createHome = true;
              };

              users.groups.${cfg.group} = { };

              systemd.services.slusha = {
                description = "Slusha Telegram bot";
                wantedBy = [ "multi-user.target" ];
                after = [ "network.target" ];

                serviceConfig = {
                  Type = "simple";
                  User = cfg.user;
                  Group = cfg.group;
                  WorkingDirectory = cfg.dataDir;
                  ExecStart = "${pkgs.bash}/bin/bash ${cfg.package}/bin/slusha";
                  Restart = "always";
                  RestartSec = "5s";

                  NoNewPrivileges = true;
                  PrivateTmp = true;
                  ProtectSystem = "strict";
                  ProtectHome = true;
                  ReadWritePaths = [ cfg.dataDir ];
                  ProtectKernelTunables = true;
                  ProtectKernelModules = true;
                  ProtectControlGroups = true;
                } // lib.optionalAttrs (cfg.environmentFile != null) {
                  EnvironmentFile = cfg.environmentFile;
                };

                environment = cfg.settings // {
                  SLUSHA_DATA_DIR = cfg.dataDir;
                } // lib.optionalAttrs (configFile != null) {
                  SLUSHA_CONFIG_PATH = configFile;
                };
              };
            }
          );
        };

      nixosModules.default = self.nixosModules.slusha;
    } // flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        slusha = buildSlusha pkgs;
      in
      {
        packages.default = slusha;
        packages.slusha = slusha;

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [ deno ];
          
          shellHook = ''
            echo "Welcome to Slusha development environment"
            echo "Deno version: $(deno --version | head -n1)"
            echo ""
            echo "Available commands:"
            echo "  deno run --allow-all main.ts           # Run the bot directly"
            echo "  deno task dev                          # Run in development mode (if configured)"
            echo "  deno fmt                               # Format code"
            echo "  deno lint                              # Lint code"
            echo "  deno check main.ts                     # Type check"
            echo "  deno cache main.ts                     # Cache dependencies"
            echo ""
            echo "Make sure to set the required environment variables:"
            echo "  BOT_TOKEN, GOOGLE_AI_KEY, and other bot configuration"
            echo ""
            echo "Configuration file: slusha.config.js"
          '';
        };

        apps.default = {
          type = "app";
          program = "${slusha}/bin/slusha";
        };

        formatter = pkgs.nixpkgs-fmt;
      });
} 