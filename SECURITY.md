# Chính sách bảo mật

## Threat model

Vigilume có quyền đọc/thao tác các tab ChatGPT và tùy chọn mở một local AI bridge. Browser session, chat content, download path, Context Vault và bearer token đều là dữ liệu nhạy cảm.

## Invariants

- Chỉ host-permission `https://chatgpt.com/*`.
- Deep Observe chỉ attach target ChatGPT.
- Native HTTP bridge bind cứng `127.0.0.1`.
- `/rpc`, `/events`, `/mcp` yêu cầu bearer token ngẫu nhiên.
- Token bản mới lưu trong `~/.vigilume/bridge-token.json`; native host cố đặt directory `0700`, file `0600` trên POSIX.
- Native Messaging stdout chỉ dùng framing protocol; log đi stderr.
- Agent action được kiểm tra capability scope tại extension, không tin UI/native bridge là authorization.
- Agent action có audit event `started` / `succeeded` / `failed` khi có target tab.
- Automation, recovery, handoff, queue và bridge không được mở rộng quyền ngầm.
- Safe Queue không bypass state guard; prompt queued chỉ gửi ở state an toàn hoặc handoff có policy rõ.
- Không retry khi còn liveness evidence.
- `DOM_DRIFT` là blocker cho auto retry mù.
- Watchdog reattach có cooldown để tránh attach storm khi debugger target đang bị DevTools/Chrome chiếm.
- Diagnostics được bounded; không chụp hidden chain-of-thought.
- Không coi generic JSON/network traffic là downloadable file.
- Bulk download chỉ tải artifact đã được classifier xác nhận là `file` và `downloadable`.
- Vigilume không execute file đã tải về.
- Không tải/execute remote JavaScript trong extension.

## Native Messaging migration

Native Messaging host chính từ v0.3.1 là `com.vigilume.bridge`. Extension có fallback tạm thời tới legacy host `com.nolane.sentinel_bridge` để không làm đứt companion đã cài từ v0.3.0. Installer mới chỉ đăng ký host Vigilume; uninstaller mới dọn cả registration hiện tại và legacy.

Các tên IndexedDB/storage legacy có thể tiếp tục tồn tại nội bộ để giữ dữ liệu người dùng qua nâng cấp. Chúng không phải branding sản phẩm và không được dùng làm authority/security signal.

## Local compromise

Process chạy cùng OS user có thể đọc file mà user đó có quyền đọc và có thể tương tác với browser/profile theo quyền hệ điều hành. Vigilume không cố bảo vệ khỏi một local account đã bị compromise hoàn toàn.

## Bearer token

Không đưa bridge token vào prompt, screenshot, issue công khai, terminal history chia sẻ hoặc log ứng dụng khác. Nếu nghi token lộ, xóa `~/.vigilume/bridge-token.json` khi bridge đã dừng để host tạo token mới ở lần chạy sau.

## Reporting

Không đăng token, browser profile, exported Context Vault hay screenshot chứa nội dung nhạy cảm vào public issue. Khi báo lỗi, dùng fixture đã redacted và mô tả selector/state tối thiểu cần thiết để tái hiện.

Xem thêm [`DISCLAIMER.md`](DISCLAIMER.md) về phạm vi trách nhiệm, file tải về và việc cấp quyền cho AI agent.
