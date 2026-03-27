#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

load_local_env() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

load_local_env "$ROOT_DIR/.env"
load_local_env "$ROOT_DIR/.packaging.env"

APP_NAME="$(node -p "require('./package.json').build.productName")"
VERSION="$(node -p "require('./package.json').version")"
APP_DIR="$ROOT_DIR/dist/mac-arm64/${APP_NAME}.app"
DMG_PATH="$ROOT_DIR/dist/${APP_NAME}-${VERSION}-arm64.dmg"
TMP_DMG_DIR="$(mktemp -d /tmp/${APP_NAME// /_}-${VERSION}-arm64.XXXXXX)"
TMP_DMG_PATH="$TMP_DMG_DIR/${APP_NAME}-${VERSION}-arm64.dmg"
VOLNAME="${APP_NAME} Installer"
STAGING_DIR="$(mktemp -d /tmp/gemini-live-dmg.XXXXXX)"
SIGN_IDENTITY="${SIGN_IDENTITY:-}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"
FAST_MODE="${1:-}"
ENTITLEMENTS_PATH="$ROOT_DIR/assets/entitlements.mac.plist"

cleanup() {
  rm -rf "$STAGING_DIR"
  [[ -n "${TMP_DMG_DIR:-}" ]] && rm -rf "$TMP_DMG_DIR"
}
trap cleanup EXIT

sign_binary() {
  local target="$1"
  if [[ -e "$target" ]]; then
    codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$target"
  fi
}

sign_bundle() {
  local target="$1"
  if [[ -e "$target" ]]; then
    codesign --force --deep --options runtime --timestamp --sign "$SIGN_IDENTITY" "$target"
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required for packaging." >&2
    exit 1
  fi
}

detach_existing_dmg() {
  local mount_point="/Volumes/$VOLNAME"
  if [[ -d "$mount_point" ]]; then
    echo "Detaching mounted DMG volume..."
    hdiutil detach "$mount_point" >/dev/null 2>&1 || hdiutil detach -force "$mount_point" >/dev/null 2>&1 || true
    sleep 1
  fi
}

echo "Building icons..."
npm run build:icons

echo "Building native helper..."
npm run build:native-helper

echo "Packaging macOS app bundle..."
export ROOT_DIR APP_DIR
python3 <<'PY'
import os
import signal
import subprocess
import sys
import time

root_dir = os.environ["ROOT_DIR"]
app_dir = os.environ["APP_DIR"]
app_marker = os.path.join(app_dir, "Contents", "Resources", "app.asar")
env = os.environ.copy()
env["CSC_IDENTITY_AUTO_DISCOVERY"] = "false"

proc = subprocess.Popen(["npx", "electron-builder", "--dir"], cwd=root_dir, env=env)
deadline = time.time() + 45

while True:
    exit_code = proc.poll()
    if exit_code is not None:
        sys.exit(exit_code)

    if time.time() >= deadline:
        if os.path.exists(app_marker):
            print("electron-builder timed out after creating the app bundle; continuing with the built app.")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            sys.exit(0)

        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        print("electron-builder timed out before the app bundle was created.", file=sys.stderr)
        sys.exit(1)

    time.sleep(1)
PY

if [[ ! -d "$APP_DIR" ]]; then
  echo "App bundle was not created at $APP_DIR" >&2
  exit 1
fi

if command -v codesign >/dev/null 2>&1; then
  require_env SIGN_IDENTITY

  echo "Signing embedded tool binaries..."
  while IFS= read -r binary; do
    sign_binary "$binary"
  done < <(find "$APP_DIR/Contents/Resources/prebuilt" -type f 2>/dev/null | sort)

  echo "Signing native helper resources..."
  while IFS= read -r binary; do
    sign_binary "$binary"
  done < <(find "$APP_DIR/Contents/Resources/native" -type f \( -name "*.dylib" -o -perm -111 \) 2>/dev/null | sort)

  while IFS= read -r bundle; do
    sign_bundle "$bundle"
  done < <(find "$APP_DIR/Contents/Resources/native" -name "*.app" -type d 2>/dev/null | sort -r)

  echo "Signing nested executable files and dylibs..."
  while IFS= read -r binary; do
    sign_binary "$binary"
  done < <(find "$APP_DIR/Contents/Frameworks" -type f \( -name "*.dylib" -o -perm -111 \) 2>/dev/null | sort)

  echo "Signing helper app bundles and frameworks..."
  while IFS= read -r bundle; do
    sign_bundle "$bundle"
  done < <(find "$APP_DIR/Contents/Frameworks" \( -name "*.framework" -o -name "*.app" \) -type d 2>/dev/null | sort -r)

  echo "Signing main app bundle with Developer ID..."
  if [[ -f "$ENTITLEMENTS_PATH" ]]; then
    codesign --force --deep --options runtime --timestamp --entitlements "$ENTITLEMENTS_PATH" --sign "$SIGN_IDENTITY" "$APP_DIR"
  else
    codesign --force --deep --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP_DIR"
  fi

  echo "Verifying code signature..."
  codesign --verify --deep --strict --verbose=2 "$APP_DIR"
fi

echo "Creating DMG installer..."
detach_existing_dmg
rm -f "$DMG_PATH"
cp -R "$APP_DIR" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"
hdiutil create \
  -volname "$VOLNAME" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$TMP_DMG_PATH" >/dev/null

mv -f "$TMP_DMG_PATH" "$DMG_PATH"

if [[ "$FAST_MODE" == "--fast" ]]; then
  echo "Fast mode enabled. Skipping notarization."
else
  require_env NOTARY_PROFILE

  echo "Submitting DMG for notarization..."
  NOTARY_OUTPUT="$(xcrun notarytool submit "$DMG_PATH" --keychain-profile "$NOTARY_PROFILE" --wait 2>&1)" || {
    echo "$NOTARY_OUTPUT"
    exit 1
  }
  echo "$NOTARY_OUTPUT"

  if ! grep -q "status: Accepted" <<<"$NOTARY_OUTPUT"; then
    SUBMISSION_ID="$(sed -n 's/.*id: \(.*\)$/\1/p' <<<"$NOTARY_OUTPUT" | tail -n 1)"
    if [[ -n "$SUBMISSION_ID" ]]; then
      echo "Fetching notarization log for failed submission..."
      xcrun notarytool log "$SUBMISSION_ID" --keychain-profile "$NOTARY_PROFILE" || true
    fi
    echo "Notarization did not return Accepted status." >&2
    exit 1
  fi

  echo "Stapling notarization ticket..."
  xcrun stapler staple "$DMG_PATH"
fi

echo ""
echo "Created app bundle:"
echo "  $APP_DIR"
echo "Created DMG:"
echo "  $DMG_PATH"
