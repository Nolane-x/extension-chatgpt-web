# Nolane Sentinel Native Bridge

Native Bridge là tùy chọn. Extension vẫn quan sát/điều khiển ChatGPT khi bridge tắt.

## Lợi ích

Bridge cho phép AI agent chạy trên máy:

- xem tất cả ChatGPT tabs;
- chờ state mục tiêu;
- chẩn đoán DOM/CDP;
- mở/focus/compose/send/queue/stop/retry;
- handoff sang chat mới;
- phát hiện/tải file;
- đọc/xóa Context Vault;
- quản lý automation theo capability scopes.

## Bảo mật

- HTTP bind cứng `127.0.0.1:17892` (đổi qua `NOLANE_SENTINEL_PORT`).
- `/rpc`, `/events`, `/mcp` yêu cầu `Authorization: Bearer <token>`.
- Token tại `~/.nolane-sentinel/bridge-token.json`, mode `0600` trên POSIX khi hỗ trợ.
- HTTP browser-origin chỉ chấp nhận `http://127.0.0.1`/`http://localhost`; extension không dùng HTTP mà kết nối host qua Chrome Native Messaging.
- Chrome Native Messaging host chỉ cho extension ID trong `allowed_origins` kết nối.
- Quyền action vẫn được extension kiểm tra lần cuối.

## Cài đặt host

1. Cài Node.js 20+.
2. Mở `chrome://extensions` và copy ID của Nolane Sentinel.
3. Chạy installer theo hệ điều hành:

**Windows**

```bat
install_host.bat YOUR_EXTENSION_ID
```

Installer tạo manifest user-level và đăng ký tại `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.nolane.sentinel_bridge`. Trên Windows, Chrome cho phép `path` của host tương đối theo thư mục chứa manifest.

**macOS / Linux**

```bash
./install_host.sh YOUR_EXTENSION_ID
```

Mặc định script cài cho Google Chrome. Có thể đặt `NOLANE_CHROME_FLAVOR=chromium` hoặc `chrome-testing` trước khi chạy để dùng vị trí manifest tương ứng. POSIX installer ghi đường dẫn host tuyệt đối như Chrome yêu cầu.

4. Bật **Cổng AI → Native Bridge** trong side panel.
5. Chỉ bật capability scopes agent thật sự cần.

Gỡ host bằng `uninstall_host.bat` hoặc `./uninstall_host.sh`. Installer không dùng wildcard trong `allowed_origins`.

## API

- `GET /health`
- `POST /rpc`
- `GET /events`
- `POST /mcp`

MCP pin protocol `2026-07-28` và hỗ trợ `server/discover`, `tools/list`, `tools/call`.

Tool v0.2 bao gồm queue, wait, diagnose và bulk artifact download; xem `docs/protocol.md` trong source/release package.
