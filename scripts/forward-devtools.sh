#!/bin/bash
# Exposes the WebView of a *debug* build running on the console to this machine, so the UI tests
# and scripts/show-tab.mjs can drive it. Undo with: adb forward --remove tcp:39115
set -euo pipefail

PORT="${CARNET_DEVTOOLS_PORT:-39115}"
PID="$(adb shell pidof fr.dabi.sinnoh | tr -d '\r')"
[ -n "$PID" ] || { echo "forward-devtools: Carnet Sinnoh is not running on the device" >&2; exit 1; }

adb forward "tcp:$PORT" "localabstract:webview_devtools_remote_$PID" >/dev/null
echo "export CARNET_DEVTOOLS=http://127.0.0.1:$PORT"
