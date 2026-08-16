#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
app="$root/native/macos/dsh-voice-macos.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
swiftc "$root/native/macos/SpeechRecognizer.swift" \
  -framework AppKit -framework Speech -framework AVFoundation \
  -o "$app/Contents/MacOS/dsh-voice-macos"
cp "$root/native/macos/Info.plist" "$app/Contents/Info.plist"
codesign --force --deep --sign - "$app" >/dev/null
printf '%s\n' "$app/Contents/MacOS/dsh-voice-macos"
