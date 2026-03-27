#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS_DIR="$ROOT_DIR/assets"
ICONSET_DIR="$ASSETS_DIR/icon.iconset"
MASTER_PNG="$ASSETS_DIR/icon-1024.png"
MASTER_SOURCE="${1:-$ASSETS_DIR/logo.png}"

mkdir -p "$ASSETS_DIR"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

if [[ -f "$MASTER_SOURCE" ]]; then
  cp "$MASTER_SOURCE" "$MASTER_PNG"
elif [[ -f "$ASSETS_DIR/logo.svg" ]]; then
  magick "$ASSETS_DIR/logo.svg" -background "#0C0C0F" -alpha remove -alpha off -resize 1024x1024 "$MASTER_PNG"
else
  echo "Missing logo source. Expected $ASSETS_DIR/logo.png or $ASSETS_DIR/logo.svg" >&2
  exit 1
fi

sizes=(16 32 64 128 256 512)

for size in "${sizes[@]}"; do
  sips -z "$size" "$size" "$MASTER_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
done

sips -z 32 32 "$MASTER_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 64 64 "$MASTER_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 256 256 "$MASTER_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 512 512 "$MASTER_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 1024 1024 "$MASTER_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

iconutil -c icns "$ICONSET_DIR" -o "$ASSETS_DIR/icon.icns"
echo "Generated $ASSETS_DIR/icon.icns"
