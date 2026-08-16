#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
app="$root/native/macos/dsh-voice-macos.app"

if [ ! -x "$app/Contents/MacOS/dsh-voice-macos" ]; then
  printf '%s\n' 'Build the macOS helper first: pnpm run build:macos' >&2
  exit 1
fi

open -n -W "$app" --args --request-permissions
