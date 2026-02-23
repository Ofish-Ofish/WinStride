#!/bin/bash
# Fetch Sigma rules from SigmaHQ for the categories WinStride supports.
# Run this after cloning the repo or to update rules.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$SCRIPT_DIR/../src/shared/detection/sigma/rules"
SIGMA_DIR=$(mktemp -d)

echo "Cloning SigmaHQ..."
git clone --depth 1 https://github.com/SigmaHQ/sigma.git "$SIGMA_DIR"

rm -rf "$DEST"
mkdir -p "$DEST/process_creation" "$DEST/network_connection" "$DEST/file_event" \
         "$DEST/ps_script" "$DEST/security" "$DEST/image_load" "$DEST/registry"

cp "$SIGMA_DIR"/rules/windows/process_creation/*.yml "$DEST/process_creation/" 2>/dev/null || true
cp "$SIGMA_DIR"/rules/windows/network_connection/*.yml "$DEST/network_connection/" 2>/dev/null || true
cp "$SIGMA_DIR"/rules/windows/file/file_event/*.yml "$DEST/file_event/" 2>/dev/null || true
cp "$SIGMA_DIR"/rules/windows/powershell/powershell_script/*.yml "$DEST/ps_script/" 2>/dev/null || true
cp "$SIGMA_DIR"/rules/windows/builtin/security/*.yml "$DEST/security/" 2>/dev/null || true
cp "$SIGMA_DIR"/rules/windows/image_load/*.yml "$DEST/image_load/" 2>/dev/null || true
cp "$SIGMA_DIR"/rules/windows/registry/registry_set/*.yml "$DEST/registry/" 2>/dev/null || true

rm -rf "$SIGMA_DIR"

TOTAL=$(find "$DEST" -name "*.yml" | wc -l)
echo "Done — $TOTAL Sigma rules fetched to src/shared/detection/sigma/rules/"
