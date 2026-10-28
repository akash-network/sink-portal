#!/usr/bin/env bash
# Packs the chain-sdk TypeScript package into .cache/chain-sdk.tgz. The portal
# needs the x/sink message types, which are not in a published release yet.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
sdk=${CHAIN_SDK_DIR:-$repo/../chain-sdk}
test -f "$sdk/ts/package.json" || { echo "Missing $sdk/ts; set CHAIN_SDK_DIR" >&2; exit 1; }
npm ci --prefix "$sdk/ts"
npm run build --prefix "$sdk/ts"
mkdir -p "$repo/.cache"
package=$(cd "$sdk/ts" && npm pack --silent --pack-destination "$repo/.cache")
mv "$repo/.cache/$package" "$repo/.cache/chain-sdk.tgz"
echo "Packed $sdk/ts into .cache/chain-sdk.tgz"
