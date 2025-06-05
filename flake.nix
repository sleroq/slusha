{
  description = "Slusha - A Telegram bot built with Deno and TypeScript";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages.default = pkgs.stdenv.mkDerivation rec {
          pname = "slusha";
          version = "0.1.0";
          src = ./.;

          nativeBuildInputs = with pkgs; [
            deno
          ];

          buildPhase = ''
            runHook preBuild
            
            # Cache dependencies first
            deno cache main.ts
            
            # Compile to binary
            deno compile --allow-all --output slusha main.ts
            
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
            license = licenses.mit; # Adjust based on your actual license
            maintainers = [ maintainers.sleroq or "sleroq" ];
            platforms = platforms.linux ++ platforms.darwin;
          };
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            deno
            # Additional development tools
            nodePackages.typescript-language-server
            nodePackages.prettier
          ];
          
          shellHook = ''
            echo "Slusha development environment"
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
          program = "${self.packages.${system}.default}/bin/slusha";
        };
      });
} 