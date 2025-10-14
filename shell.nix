{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShellNoCC {
  packages = with pkgs; [
    python3
    nodejs_24
    bun
    git
  ];
}
