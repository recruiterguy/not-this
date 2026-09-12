#!/usr/bin/env sh
# Builds dist/not-this-<version>.zip for store submission (macOS/Linux).
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
zip="dist/not-this-$version.zip"
rm -f "$zip"
zip -r "$zip" manifest.json src popup icons -x '*.DS_Store'
echo "Wrote $zip"
