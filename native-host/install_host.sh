#!/bin/sh
set -eu

HOST_NAME="com.nolane.sentinel_bridge"
EXTENSION_ID="${1:-}"
FLAVOR="${NOLANE_CHROME_FLAVOR:-chrome}"

if [ -z "$EXTENSION_ID" ]; then
  echo "Cách dùng: ./install_host.sh <CHROME_EXTENSION_ID>" >&2
  exit 2
fi
case "$EXTENSION_ID" in
  *[!a-p]*|'') echo "Extension ID không hợp lệ: $EXTENSION_ID" >&2; exit 2 ;;
esac
if [ "${#EXTENSION_ID}" -ne 32 ]; then
  echo "Extension ID phải dài 32 ký tự." >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Cần Node.js 20+ trong PATH." >&2
  exit 3
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
HOST_PATH="$SCRIPT_DIR/nolane-sentinel-native-host"
chmod 700 "$HOST_PATH"

case "$(uname -s)" in
  Darwin)
    case "$FLAVOR" in
      chromium) MANIFEST_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts" ;;
      chrome-testing) MANIFEST_DIR="$HOME/Library/Application Support/Google/ChromeForTesting/NativeMessagingHosts" ;;
      *) MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
    esac
    ;;
  Linux)
    case "$FLAVOR" in
      chromium) MANIFEST_DIR="$HOME/.config/chromium/NativeMessagingHosts" ;;
      chrome-testing) MANIFEST_DIR="$HOME/.config/google-chrome-for-testing/NativeMessagingHosts" ;;
      *) MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
    esac
    ;;
  *) echo "Hệ điều hành không được script POSIX hỗ trợ." >&2; exit 4 ;;
esac

mkdir -p "$MANIFEST_DIR"
MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"
node - "$MANIFEST_PATH" "$HOST_PATH" "$EXTENSION_ID" <<'NODE'
const fs=require('node:fs');
const [file,hostPath,extensionId]=process.argv.slice(2);
const manifest={
  name:'com.nolane.sentinel_bridge',
  description:'Nolane Sentinel local AI/MCP bridge',
  path:hostPath,
  type:'stdio',
  allowed_origins:[`chrome-extension://${extensionId}/`]
};
fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
NODE
chmod 600 "$MANIFEST_PATH" 2>/dev/null || true

echo "Đã cài Native Messaging host: $MANIFEST_PATH"
echo "Extension ID: $EXTENSION_ID"
echo "Khởi động lại Chrome nếu bridge chưa kết nối ngay."
