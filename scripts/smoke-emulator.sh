#!/bin/bash
# Installs and exercises the app on the device adb currently sees (an emulator, in CI).
# Checks that a release build installs and stays up, then smoke-tests a debug build.
set -euo pipefail
cd "$(dirname "$0")/.."

launch() {
  adb install -r build/carnet-sinnoh.apk
  adb shell am start -W -n fr.dabi.sinnoh/.MainActivity
  sleep 5
  adb shell pidof fr.dabi.sinnoh >/dev/null || { echo "smoke: the app is not running after launch" >&2; exit 1; }
}

bash scripts/build.sh
launch
adb uninstall fr.dabi.sinnoh

bash scripts/build.sh debug
launch
eval "$(bash scripts/forward-devtools.sh)"
node tests/device/smoke.mjs
