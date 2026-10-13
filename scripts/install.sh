#!/bin/bash
# Installs build/carnet-sinnoh.apk on the connected console and opens it.
#
# Environment:
#   ANDROID_SERIAL   device to use when several are connected (standard adb variable)
#   CARNET_DISPLAY   Android display to open the app on. On an AYN Thor the bottom screen is 4
#                    and the top one is 0; leave unset on a single-screen device.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f build/carnet-sinnoh.apk ] || { echo "install: build the APK first (scripts/build.sh)" >&2; exit 1; }

adb install -r build/carnet-sinnoh.apk
START=(shell am start)
if [ -n "${CARNET_DISPLAY:-}" ]; then START+=(--display "$CARNET_DISPLAY"); fi
adb "${START[@]}" -n fr.dabi.sinnoh/.MainActivity
