# Chính sách bảo mật

## Threat model

Nolane Sentinel có quyền đọc/thao tác các tab ChatGPT và tùy chọn mở một local AI bridge. Browser session, chat content, download path, Context Vault và bearer token đều là dữ liệu nhạy cảm.

## Invariants

- Chỉ host-permission `https://chatgpt.com/*`.
- Deep Observe chỉ attach target ChatGPT.
- Native HTTP bridge bind cứng `127.0.0.1`.
- `/rpc`, `/events`, `/mcp` yêu cầu bearer token ngẫu nhiên.
- Token lưu trong `~/.nolane-sentinel/bridge-token.json`; native host cố đặt directory `0700`, file `0600` trên POSIX.
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
- Sentinel không execute file đã tải về.
- Không tải/execute remote JavaScript trong extension.

## Local compromise

Process chạy cùng OS user có thể đọc file mà user đó có quyền đọc và có thể tương tác với browser/profile theo quyền hệ điều hành. Sentinel không cố bảo vệ khỏi một local account đã bị compromise hoàn toàn.

## Bearer token

Không đưa bridge token vào prompt, screenshot, issue công khai, terminal history chia sẻ hoặc log ứng dụng khác. Nếu nghi token lộ, xóa `~/.nolane-sentinel/bridge-token.json` khi bridge đã dừng để host tạo token mới ở lần chạy sau.

## Reporting

Không đăng token, browser profile, exported Context Vault hay screenshot chứa nội dung nhạy cảm vào public issue. Khi báo lỗi, dùng fixture đã redacted và mô tả selector/state tối thiểu cần thiết để tái hiện.
