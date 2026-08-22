# Vigilume Native Bridge

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
- quản lý automation và Task Orchestrator theo capability scopes.

## Bảo mật

- HTTP bind cứng `127.0.0.1:17892` (đổi qua `VIGILUME_PORT`; biến legacy `NOLANE_SENTINEL_PORT` vẫn được đọc để hỗ trợ migration).
- `/rpc`, `/events`, `/mcp` yêu cầu `Authorization: Bearer <token>`.
- Token bản mới tại `~/.vigilume/bridge-token.json`, mode `0600` trên POSIX khi hỗ trợ.
- HTTP browser-origin chỉ chấp nhận `http://127.0.0.1`/`http://localhost`; extension không dùng HTTP mà kết nối host qua Chrome Native Messaging.
- Chrome Native Messaging host chỉ cho extension ID trong `allowed_origins` kết nối.
- Quyền action vẫn được extension kiểm tra lần cuối.

## Cài đặt host

1. Cài Node.js 20+.
2. Mở `chrome://extensions` và copy ID của Vigilume.
3. Chạy installer theo hệ điều hành:

**Windows**

```bat
install_host.bat YOUR_EXTENSION_ID
```

Installer tạo manifest user-level và đăng ký tại `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.vigilume.bridge`. Trên Windows, Chrome cho phép `path` của host tương đối theo thư mục chứa manifest.

**macOS / Linux**

```bash
./install_host.sh YOUR_EXTENSION_ID
```

Mặc định script cài cho Google Chrome. Có thể đặt `VIGILUME_CHROME_FLAVOR=chromium` hoặc `chrome-testing` trước khi chạy để dùng vị trí manifest tương ứng. POSIX installer ghi đường dẫn host tuyệt đối như Chrome yêu cầu.

4. Bật **Cổng AI → Native Bridge** trong side panel.
5. Chỉ bật capability scopes agent thật sự cần.

Gỡ host bằng `uninstall_host.bat` hoặc `./uninstall_host.sh`. Uninstaller cũng dọn registration legacy `com.nolane.sentinel_bridge` nếu còn tồn tại sau khi nâng cấp. Installer không dùng wildcard trong `allowed_origins`.

## Migration từ v0.3.0

Vigilume dùng Native Messaging host mới `com.vigilume.bridge`. Extension v0.3.1 thử host mới trước và chỉ fallback sang `com.nolane.sentinel_bridge` để người dùng đang có companion cũ vẫn tiếp tục hoạt động trong giai đoạn nâng cấp.

Sau khi cài Native Bridge v0.3.1 thành công, nên chạy uninstaller cũ hoặc uninstaller mới để xóa registration legacy không còn dùng.

## API

- `GET /health`
- `POST /rpc`
- `GET /events`
- `POST /mcp`

MCP pin protocol `2026-07-28` và hỗ trợ `server/discover`, `tools/list`, `tools/call` với 39 tools hiện tại. Xem `docs/protocol.md` trong source/release package.
