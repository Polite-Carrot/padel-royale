#!/bin/zsh
# Regenerates native assets; --icons-only leaves the existing splash screens unchanged.
set -e
cd "$(dirname "$0")/.."
node tools/render-icon.mjs
if [[ "${1:-}" == "--icons-only" ]]; then exit 0; fi
SPLASH=assets/splash.png
RES=android/app/src/main/res
XC=ios/App/App/Assets.xcassets

for f in splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png; do cp "$SPLASH" "$XC/Splash.imageset/$f"; done

# Portrait/landscape splash drawables: scale the square splash to cover, then centre-crop.
splash() { # dir width height
  local side=$(( $2 > $3 ? $2 : $3 ))
  sips -z $side $side "$SPLASH" --out "$RES/$1/splash.png" >/dev/null
  sips -c $3 $2 "$RES/$1/splash.png" >/dev/null
}
splash drawable 480 320
splash drawable-port-mdpi 320 480;   splash drawable-land-mdpi 480 320
splash drawable-port-hdpi 480 800;   splash drawable-land-hdpi 800 480
splash drawable-port-xhdpi 720 1280; splash drawable-land-xhdpi 1280 720
splash drawable-port-xxhdpi 960 1600; splash drawable-land-xxhdpi 1600 960
splash drawable-port-xxxhdpi 1280 1920; splash drawable-land-xxxhdpi 1920 1280
echo "icons + splash regenerated"
