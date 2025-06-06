{
  description = "Slusha - A Telegram bot built with Deno and TypeScript";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
  
    let
      src = ./.;

      # Cache all dependencies for faster builds
      cacheDeps = pkgs: pkgs.stdenv.mkDerivation {
        name = "deno-deps-cache";
        inherit src;
        buildInputs = [ pkgs.deno ];

        buildPhase = ''
          export HOME=$(mktemp -d)
          export DENO_DIR=$HOME/.cache/deno
          
          # Cache all dependencies
          deno install --allow-import --entrypoint main.ts
        '';

        installPhase = ''
          mkdir -p $out
          cp -r $HOME/.cache/deno $out/deno_cache
          cp -r vendor $out/vendor
        '';

        outputHashMode = "recursive";
        outputHashAlgo = "sha256";
        outputHash = "sha256-fgudcMR6PEQkSm9qfnWxpxevyhULxTI3iFuFqzQ0IX4=";
      };

      buildSlusha = pkgs: pkgs.stdenv.mkDerivation rec {
        pname = "slusha";
        version = "0.1.0";

        inherit src;

        nativeBuildInputs = with pkgs; [ deno ];

        buildPhase = ''
          runHook preBuild
          
          export HOME=$(mktemp -d)
          export DENO_DIR=$HOME/.cache/deno
          
          # Copy cached dependencies
          mkdir -p $HOME/.cache
          cp -r ${cacheDeps pkgs}/deno_cache $DENO_DIR
          cp -r ${cacheDeps pkgs}/vendor ./vendor
          
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          
          mkdir -p $out/bin
          mkdir -p $out/share/slusha
          
          # Copy source code and dependencies
          cp -r . $out/share/slusha/
          cp -r $DENO_DIR $out/share/slusha/.deno_cache
          
          # Create wrapper script
          cat > $out/bin/slusha << EOF
#!/usr/bin/env bash
set -euo pipefail

# Set up Deno cache directory
export DENO_DIR="\$HOME/.cache/deno"
mkdir -p "\$DENO_DIR"

# Copy cached dependencies if cache is empty
if [ ! -d "\$DENO_DIR/deps" ]; then
  cp -r "$out/share/slusha/.deno_cache"/* "\$DENO_DIR/" 2>/dev/null || true
fi

# Create a temporary working directory
WORK_DIR="\$(mktemp -d)"
cd "\$WORK_DIR"

# Copy necessary files to working directory
cp -r "$out/share/slusha"/* .

# Run the application
exec ${pkgs.deno}/bin/deno run --allow-all --cached-only main.ts "\$@"
EOF
          
          chmod +x $out/bin/slusha
          
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
                  ExecStart = "${cfg.package}/bin/slusha";
                  Restart = "always";
                  RestartSec = "5s";

                  # Security settings
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