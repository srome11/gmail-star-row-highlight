#!/usr/bin/env bash
#
# Builds the Safari version of the Gmail Star Row Highlight extension.
#
# It copies the raw web-extension files into build/webext, regenerates the
# Xcode project with safari-web-extension-converter, then builds the macOS app.
#
# Requirements: Xcode (full install, not just Command Line Tools).
#
# Usage:
#   ./build-safari.sh          # convert + build
#   ./build-safari.sh --open   # convert + open the project in Xcode instead
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="GmailStarRowHighlight"
# Override with your own reverse-DNS id before building, e.g.:
#   GSRH_BUNDLE_ID=com.yourname.GmailStarRowHighlight ./build-safari.sh
# The last component MUST equal APP_NAME (GmailStarRowHighlight).
BUNDLE_ID="${GSRH_BUNDLE_ID:-com.local.GmailStarRowHighlight}"
WEBEXT_DIR="$ROOT/build/webext"
PROJECT_DIR="$ROOT/safari"

echo "==> Staging web-extension files"
rm -rf "$WEBEXT_DIR"
mkdir -p "$WEBEXT_DIR"
cp "$ROOT/manifest.json" "$ROOT/content.js" "$ROOT/styles.css" "$WEBEXT_DIR/"

echo "==> Converting to a Safari Web Extension Xcode project"
rm -rf "$PROJECT_DIR"
CONVERTER_ARGS=(
  "$WEBEXT_DIR"
  --project-location "$PROJECT_DIR"
  --app-name "$APP_NAME"
  --bundle-identifier "$BUNDLE_ID"
  --macos-only
  --copy-resources
  --no-prompt
  --force
)

if [[ "${1:-}" == "--open" ]]; then
  xcrun safari-web-extension-converter "${CONVERTER_ARGS[@]}"
  echo "==> Opened the project in Xcode. Press the Run (▶) button to install."
  exit 0
fi

xcrun safari-web-extension-converter "${CONVERTER_ARGS[@]}" --no-open

echo "==> Building the macOS app (ad-hoc signed, for local use)"
xcodebuild \
  -project "$PROJECT_DIR/$APP_NAME/$APP_NAME.xcodeproj" \
  -scheme "$APP_NAME" \
  -configuration Debug \
  -destination 'platform=macOS' \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="" \
  build

APP_PATH="$(find "$HOME/Library/Developer/Xcode/DerivedData/${APP_NAME}-"*/Build/Products/Debug -maxdepth 1 -name "${APP_NAME}.app" 2>/dev/null | head -1)"
echo ""
echo "==> Build complete."
echo "    App: $APP_PATH"
echo ""
echo "Next steps:"
echo "  1) open \"$APP_PATH\"   (this registers the extension with Safari)"
echo "  2) Safari > Settings > Extensions > enable 'Gmail Star Row Highlight'"
echo "  3) If it doesn't appear, enable Safari's Develop menu and turn on"
echo "     'Allow Unsigned Extensions' (see README)."
