{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    parts.url = "github:hercules-ci/flake-parts";
    parts.inputs.nixpkgs-lib.follows = "nixpkgs";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    inputs@{
      self,
      parts,
      systems,
      ...
    }:
    parts.lib.mkFlake { inherit inputs; } {
      systems = builtins.filter (system: system != "x86_64-darwin") (import systems);
      flake.nixosModules.default = import ./nix/module.nix { inherit self; };

      perSystem =
        { pkgs, system, ... }:
        let
          bunRelease =
            {
              aarch64-darwin = {
                name = "bun-darwin-aarch64";
                hash = "sha256-wkDX8My5DCY6hJ/NsJt+5iYw2SE0jtaq/ahrnVd7xRA=";
              };
              aarch64-linux = {
                name = "bun-linux-aarch64";
                hash = "sha256-uqa7NvUdblhWHgK76oJQOKnfRU9nPW13bou/hvjHhQ4=";
              };
              x86_64-linux = {
                name = "bun-linux-x64";
                hash = "sha256-v4zL+ysLgBWeD5ptFcVTF63YB3U028YTCj7bUvzLOVw=";
              };
            }
            .${system};
          source = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.unions [
              ./package.json
              ./bun.lock
              ./tsconfig.json
              ./src
              ./shared
              ./web/package.json
              ./web/tsconfig.json
              ./web/vite.config.ts
              ./web/index.html
              ./web/src
              ./web/static
              ./packages/mini-app/package.json
              ./packages/mini-app/src
            ];
          };
          bun = pkgs.stdenvNoCC.mkDerivation {
            pname = "bun";
            version = "1.4.4";
            src = pkgs.fetchurl {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/${bunRelease.name}.zip";
              inherit (bunRelease) hash;
            };
            nativeBuildInputs = [
              pkgs.unzip
            ]
            ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];
            buildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.stdenv.cc.cc.lib ];
            installPhase = ''
              install -Dm755 bun $out/bin/bun
            '';
          };
          slusha = import ./nix/package.nix {
            inherit pkgs bun source;
            cacheHash =
              {
                aarch64-linux = "sha256-oqAUqZoRbNzXqlZ6fkD1jXVV3+Uv+ZdljfLEFNTSGZY=";
                x86_64-linux = "sha256-k6ye+YWHOPHfcpsNhWNbjQt6LzVwR316k/wwuo2rdXA=";
              }
              .${system};
          };
        in
        {
          packages = pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
            default = slusha.app;
            bun-cache = slusha.cache;
          };
          devShells.default = pkgs.mkShell {
            packages = with pkgs; [
              bun
              direnv
              git
              nix-direnv
              bore-cli
              postgresql
              sqlite
            ];
          };
        };
    };
}
