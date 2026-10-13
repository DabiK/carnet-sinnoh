#!/bin/bash
# Builds build/carnet-sinnoh.apk with the Android SDK command-line tools alone (no Gradle).
# Usage: scripts/build.sh [debug]
#   debug   debuggable APK: enables WebView remote debugging, required by the on-device tests.
#
# Environment:
#   ANDROID_SDK_ROOT          SDK location (falls back to ANDROID_HOME, then ~/Library/Android/sdk)
#   ANDROID_BUILD_TOOLS       build-tools version (default 36.0.0)
#   ANDROID_PLATFORM          platform to compile against (default android-36.1)
#   CARNET_KEYSTORE           signing keystore (default build/dev.keystore, created on first build)
#   CARNET_KEYSTORE_PASSWORD  its password (default "android", the usual development password)
set -euo pipefail
cd "$(dirname "$0")/.."

SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
BUILD_TOOLS="$SDK_DIR/build-tools/${ANDROID_BUILD_TOOLS:-36.0.0}"
ANDROID_JAR="$SDK_DIR/platforms/${ANDROID_PLATFORM:-android-36.1}/android.jar"
KEYSTORE="${CARNET_KEYSTORE:-build/dev.keystore}"
KEYSTORE_PASSWORD="${CARNET_KEYSTORE_PASSWORD:-android}"
KEY_ALIAS=sinnoh
PACKAGE_DIR=fr/dabi/sinnoh

fail() {
  echo "build: $1" >&2
  exit 1
}

[ -x "$BUILD_TOOLS/aapt" ] || fail "build-tools not found in $BUILD_TOOLS (set ANDROID_SDK_ROOT, see docs/INSTALLATION.md)"
[ -f "$ANDROID_JAR" ] || fail "platform not found: $ANDROID_JAR"
[ -f assets/sprites/387.png ] || fail "sprites are missing: restore assets/sprites with git, or run 'node scripts/fetch-assets.mjs'"
[ -f assets/sinnoh-2d.png ] || echo "build: warning, assets/sinnoh-2d.png is missing: the map will have no background" >&2

# Stale classes from a previous build would otherwise end up in the APK.
rm -rf build/classes build/dex
mkdir -p build/classes build/dex

PACKAGE_FLAGS=(package -f)
if [ "${1:-}" = "debug" ]; then PACKAGE_FLAGS+=(--debug-mode); fi
"$BUILD_TOOLS/aapt" "${PACKAGE_FLAGS[@]}" -M AndroidManifest.xml -S res -A assets -I "$ANDROID_JAR" -F build/unsigned.apk

javac --release 8 -Xlint:-options -classpath "$ANDROID_JAR" -d build/classes "src/$PACKAGE_DIR"/*.java
"$BUILD_TOOLS/d8" --min-api 26 --lib "$ANDROID_JAR" --output build/dex "build/classes/$PACKAGE_DIR"/*.class
(cd build/dex && zip -q -u ../unsigned.apk classes.dex)
"$BUILD_TOOLS/zipalign" -f 4 build/unsigned.apk build/aligned.apk

# Android only updates an installed app in place when the signing key is unchanged, and the
# notebook lives in the app's private storage: keep this keystore to keep your data.
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KEYSTORE_PASSWORD" -keypass "$KEYSTORE_PASSWORD" \
    -alias "$KEY_ALIAS" -dname 'CN=Carnet Sinnoh Local' -keyalg RSA -keysize 2048 -validity 10000 -noprompt
fi
"$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEYSTORE_PASSWORD" --key-pass "pass:$KEYSTORE_PASSWORD" \
  --out build/carnet-sinnoh.apk build/aligned.apk
"$BUILD_TOOLS/apksigner" verify build/carnet-sinnoh.apk
echo 'APK prête : build/carnet-sinnoh.apk'
