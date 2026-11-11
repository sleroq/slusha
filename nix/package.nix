{
  pkgs,
  bun,
  source,
  cacheHash,
}:
let
  cache = pkgs.stdenvNoCC.mkDerivation {
    pname = "slusha-bun-cache";
    version = "1";
    src = source;
    nativeBuildInputs = [
      bun
      pkgs.cacert
    ];
    outputHashMode = "recursive";
    outputHash = cacheHash;
    dontFixup = true;
    buildPhase = ''
      export HOME="$TMPDIR/home"
      export BUN_INSTALL_CACHE_DIR="$out"
      mkdir -p "$HOME" "$out"
      bun pm fetch --os=linux --cpu=${
        if pkgs.stdenv.hostPlatform.isAarch64 then "arm64" else "x64"
      } --libc=glibc
      while IFS= read -r -d "" link; do
        target="$(readlink "$link")"
        if [[ "$target" == "$out/"* ]]; then
          ln -snf "$(realpath -ms --relative-to="$(dirname "$link")" "$target")" "$link"
        fi
      done < <(find "$out" -type l -print0)
    '';
    installPhase = "true";
  };

  app = pkgs.stdenv.mkDerivation {
    pname = "slusha";
    version = "0.1.0";
    src = source;
    nativeBuildInputs = [
      bun
      pkgs.makeWrapper
    ]
    ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];
    buildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.stdenv.cc.cc.lib ];
    buildPhase = ''
      export HOME="$TMPDIR/home"
      export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
      mkdir -p "$HOME" "$BUN_INSTALL_CACHE_DIR"
      cp -R ${cache}/. "$BUN_INSTALL_CACHE_DIR/"
      chmod -R u+w "$BUN_INSTALL_CACHE_DIR"
      bun install --offline --frozen-lockfile --ignore-scripts --backend=copyfile
      ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux "autoPatchelf node_modules"}
      (cd web && bun node_modules/vite/bin/vite.js build)
    '';
    installPhase = ''
      mkdir -p "$out/share/slusha" "$out/bin"
      cp -R node_modules src shared packages web package.json "$out/share/slusha/"
      makeWrapper ${bun}/bin/bun "$out/bin/slusha" \
        --chdir "$out/share/slusha" \
        --add-flags "--no-install src/main.ts"
    '';
    meta.mainProgram = "slusha";
  };
in
{
  inherit app cache;
}
