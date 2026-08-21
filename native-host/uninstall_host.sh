#!/bin/sh
set -eu
HOST_NAME="com.nolane.sentinel_bridge"
FLAVOR="${NOLANE_CHROME_FLAVOR:-chrome}"
case "$(uname -s)" in
  Darwin)
    case "$FLAVOR" in
      chromium) DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts" ;;
      chrome-testing) DIR="$HOME/Library/Application Support/Google/ChromeForTesting/NativeMessagingHosts" ;;
      *) DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
    esac ;;
  Linux)
    case "$FLAVOR" in
      chromium) DIR="$HOME/.config/chromium/NativeMessagingHosts" ;;
      chrome-testing) DIR="$HOME/.config/google-chrome-for-testing/NativeMessagingHosts" ;;
      *) DIR="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
    esac ;;
  *) echo "Hệ điều hành không được script POSIX hỗ trợ." >&2; exit 4 ;;
esac
rm -f "$DIR/$HOST_NAME.json"
echo "Đã gỡ Native Messaging host của Nolane Sentinel."
