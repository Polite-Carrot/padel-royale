#!/bin/zsh
# Regenerates every native icon/splash from assets/icon-only.png (1024) and assets/splash.png (2732) using macOS sips.
set -e
cd "$(dirname "$0")/.."
ICON=assets/icon-only.png
SPLASH=assets/splash.png
RES=android/app/src/main/res
XC=ios/App/App/Assets.xcassets

cp "$ICON" "$XC/AppIcon.appiconset/AppIcon-512@2x.png"
for f in splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png; do cp "$SPLASH" "$XC/Splash.imageset/$f"; done

typeset -A LAUNCHER=(mdpi 48 hdpi 72 xhdpi 96 xxhdpi 144 xxxhdpi 192)
typeset -A FOREGROUND=(mdpi 108 hdpi 162 xhdpi 216 xxhdpi 324 xxxhdpi 432)
for d in ${(k)LAUNCHER}; do
  sips -z $LAUNCHER[$d] $LAUNCHER[$d] "$ICON" --out "$RES/mipmap-$d/ic_launcher.png" >/dev/null
  sips -z $LAUNCHER[$d] $LAUNCHER[$d] "$ICON" --out "$RES/mipmap-$d/ic_launcher_round.png" >/dev/null
  sips -z $FOREGROUND[$d] $FOREGROUND[$d] "$ICON" --out "$RES/mipmap-$d/ic_launcher_foreground.png" >/dev/null
done

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
