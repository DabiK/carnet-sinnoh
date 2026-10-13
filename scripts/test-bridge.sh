#!/bin/bash
# Runs the memory bridge tests on a plain JVM: no Android SDK, console or emulator needed.
# The bridge is exercised over real sockets against a fake GDB stub and a synthetic game image.
set -euo pipefail
cd "$(dirname "$0")/.."

# On Android, org.json is part of the platform. On a desktop JVM it has to be supplied.
JSON_VERSION=20250107
JSON_SHA256=85d4c1ab192d3117fd02c7fff1ec0fe63ade45cf56def7fe950ef060cf06e99f
JSON_JAR="build/test-libs/json-$JSON_VERSION.jar"
OUT=build/test-classes

if [ ! -f "$JSON_JAR" ]; then
  mkdir -p "$(dirname "$JSON_JAR")"
  curl -fsSL -o "$JSON_JAR.part" "https://repo1.maven.org/maven2/org/json/json/$JSON_VERSION/json-$JSON_VERSION.jar"
  echo "$JSON_SHA256  $JSON_JAR.part" | shasum -a 256 -c - >/dev/null
  mv "$JSON_JAR.part" "$JSON_JAR"
fi

# Everything except MainActivity, the only class that needs the Android framework.
SOURCES=()
for file in src/fr/dabi/sinnoh/*.java tests/bridge/fr/dabi/sinnoh/*.java; do
  [ "$(basename "$file")" = MainActivity.java ] || SOURCES+=("$file")
done

rm -rf "$OUT"
mkdir -p "$OUT"
javac -Xlint:all -Xlint:-serial,-try -Werror -classpath "$JSON_JAR" -d "$OUT" "${SOURCES[@]}"
java -classpath "$OUT:$JSON_JAR" fr.dabi.sinnoh.AllTests
