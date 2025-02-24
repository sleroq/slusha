{ pkgs ? import (fetchTarball "https://github.com/NixOS/nixpkgs/archive/nixos-unstable.tar.gz") {} }:

let
  deno = pkgs.deno;
in

pkgs.mkShell {
  buildInputs = [
    deno
  ];
}
