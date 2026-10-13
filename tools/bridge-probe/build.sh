#!/bin/bash
# Builds the standalone diagnostic app (fr.dabi.sinnoh.bridge) used to investigate memory
# layouts. Signed with the main app's development keystore: build the main APK once first.
set -euo pipefail
cd "$(dirname "$0")"

SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
BUILD_TOOLS="$SDK_DIR/build-tools/${ANDROID_BUILD_TOOLS:-36.0.0}"
ANDROID_JAR="$SDK_DIR/platforms/${ANDROID_PLATFORM:-android-36.1}/android.jar"
KEYSTORE="${CARNET_KEYSTORE:-../../build/dev.keystore}"
KEYSTORE_PASSWORD="${CARNET_KEYSTORE_PASSWORD:-android}"

rm -rf build/classes build/dex
mkdir -p build/classes build/dex
"$BUILD_TOOLS/aapt" package -f -M AndroidManifest.xml -I "$ANDROID_JAR" -F build/unsigned.apk
javac --release 8 -Xlint:-options -classpath "$ANDROID_JAR" -d build/classes ProbeActivity.java
"$BUILD_TOOLS/d8" --min-api 26 --lib "$ANDROID_JAR" --output build/dex build/classes/fr/dabi/sinnoh/bridge/*.class
(cd build/dex && zip -q -u ../unsigned.apk classes.dex)
"$BUILD_TOOLS/zipalign" -f 4 build/unsigned.apk build/aligned.apk
"$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-key-alias sinnoh \
  --ks-pass "pass:$KEYSTORE_PASSWORD" --key-pass "pass:$KEYSTORE_PASSWORD" \
  --out build/bridge-probe.apk build/aligned.apk
"$BUILD_TOOLS/apksigner" verify build/bridge-probe.apk
