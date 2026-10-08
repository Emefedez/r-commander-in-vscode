#!/usr/bin/env bash
# Builds dist/r-commander-play-<version>.vsix from the working tree.
set -euo pipefail
cd "$(dirname "$0")/.."
node build/generate.js >/dev/null
version=$(node -p "require('./package.json').version")
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/extension" dist
cp -r extension.js runner.R package.json package.nls.json package.nls.es.json package.nls.en.json README.md icons lib catalog data i18n "$stage/extension/"
sed "s/__VERSION__/$version/" build/vsix/extension.vsixmanifest > "$stage/extension.vsixmanifest"
cp "build/vsix/[Content_Types].xml" "$stage/[Content_Types].xml"
out="$PWD/dist/r-commander-play-$version.vsix"
rm -f "$out"
(cd "$stage" && zip -qr "$out" extension.vsixmanifest '[Content_Types].xml' extension)
echo "$out"
