#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_PATH="$ROOT_DIR/native/LioHotkeyHelper.swift"
BUNDLE_DIR="$ROOT_DIR/assets/native/macos-arm64/LioHotkeyHelper.app"
CONTENTS_DIR="$BUNDLE_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
EXECUTABLE_PATH="$MACOS_DIR/LioHotkeyHelper"
PLIST_PATH="$CONTENTS_DIR/Info.plist"
APP_ID="$(node -p "const p=require('$ROOT_DIR/package.json'); p.build?.appId || 'com.example.lio'")"
HELPER_BUNDLE_ID="${HELPER_BUNDLE_ID:-${APP_ID}.hotkey-helper}"

mkdir -p "$MACOS_DIR"

if [[ -f "$EXECUTABLE_PATH" && "$EXECUTABLE_PATH" -nt "$SOURCE_PATH" ]]; then
  echo "Native helper is up to date."
else
  echo "Building native macOS hotkey helper..."
  xcrun swiftc \
    -O \
    -framework AppKit \
    -framework ApplicationServices \
    "$SOURCE_PATH" \
    -o "$EXECUTABLE_PATH"
  chmod +x "$EXECUTABLE_PATH"
fi

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>LioHotkeyHelper</string>
    <key>CFBundleIdentifier</key>
    <string>${HELPER_BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Lio Hotkey Helper</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
  </dict>
</plist>
PLIST

echo "Built $BUNDLE_DIR"
