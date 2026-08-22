# Nolane Sentinel v0.2.0 — Release Notes

Bản 0.2.0 biến Sentinel thành một **supervisory runtime cho ChatGPT Web nhiều tab**: quan sát sâu, thao tác có state guard, phục hồi, handoff context, quản lý artifact và mở cổng cho AI agent cục bộ.

## Điểm nổi bật

- **DOM Drift Guard:** không nhầm UI thay đổi với turn chết.
- **Deep Thinking Guard:** ChatGPT có thể im lặng lâu nhưng vẫn đang suy nghĩ/research/tool-work; Sentinel giữ turn sống và khóa retry nhầm.
- **Safe Prompt Queue:** xếp lệnh tiếp theo trong lúc ChatGPT còn bận; chỉ gửi khi state an toàn hoặc handoff sang chat mới khi đạt conversation limit.
- **Recovery Engine:** lỗi mạng/stall thật dùng bounded backoff, lưu lịch qua `chrome.storage` + `chrome.alarms`.
- **Session Resurrection:** state, timing, artifact và DOM health được phục hồi sau MV3 service-worker restart.
- **Context Handoff:** mở ChatGPT mới và mang visible context + artifact references sang khi chat chạm giới hạn.
- **Agent Wait/Diagnose:** agent có thể chờ state mục tiêu hoặc lấy bounded DOM/CDP/Network/Performance diagnostics.
- **Artifact Intelligence:** phát hiện file thật từ DOM + MIME/filename + Content-Disposition + CDP Network + Chrome Downloads; hỗ trợ tải một file hoặc tải hàng loạt.
- **Agent Audit Trail:** action qua bridge có started/succeeded/failed event kèm scope và duration.
- **NUI Observatory Console:** nhiều session, health/confidence/timing, queue, file workflow, bridge/scopes, settings và Session Microscope.
- **Deep Controls trong Microscope:** Stop, Retry có backoff và Handoff chỉ xuất hiện khi state phù hợp.

## Kiến trúc production

Service worker monolith đã được tách thành các module trách nhiệm rõ ràng:

- `runtime-state`
- `session-runtime`
- `action-controller`
- `scheduler`
- `control-plane`
- `lifecycle`
- entrypoint MV3 tối giản

Cấu trúc này giúp UI drift/recovery/agent control có thể được sửa và kiểm chứng độc lập, đồng thời giảm shared-state coupling.

## Agent bridge

Native companion tùy chọn cung cấp Native Messaging + loopback JSON-RPC/Event Stream/MCP. MCP pin protocol `2026-07-28` và có **23 tools**. Capability scopes độc lập; không có “god mode”.

Bridge mặc định tắt. HTTP companion chỉ bind `127.0.0.1` và yêu cầu bearer token; extension giao tiếp với companion qua Chrome Native Messaging.

## Cài đặt / nền tảng

- **Chrome 120+** / Manifest V3.
- Native Bridge có installer/uninstaller user-level cho Windows, macOS và Linux.
- Tiếng Việt mặc định; English UI có sẵn.
- Automation và AI Bridge mặc định tắt.

## Artifacts release

- `nolane-sentinel-v0.2.0-extension.zip`
- `nolane-sentinel-v0.2.0-native-bridge.zip`
- `nolane-sentinel-v0.2.0-source.zip`
- `SHA256SUMS.txt`

Các ZIP được tạo bằng deterministic builder nội bộ. Pipeline release kiểm SHA-256 trước khi publish.

## Verification

GitHub Actions thực hiện bốn gate trước release:

1. Node test suite.
2. Static/runtime verifier: manifest, JS syntax, relative imports, không remote hosted-code/eval, background runtime graph, installer/native constraints và parity 23 MCP tools.
3. Deterministic package build.
4. `sha256sum -c SHA256SUMS.txt`.

Sau khi toàn bộ PASS, workflow ghi `verification/latest.json` gắn với source commit đã kiểm chứng. Release pipeline sau đó verify lại trước khi mirror artifacts, tạo tag và publish GitHub Release.

## Verification boundary

Các gate trên chứng minh source/runtime contracts và release artifacts trong môi trường CI. **Chúng không chứng minh mọi rollout ChatGPT Web của mọi account đều có DOM giống nhau.** ChatGPT Web là surface có thể thay đổi; khi evidence mâu thuẫn hoặc selector drift, Sentinel ưu tiên `DOM_DRIFT`/degraded diagnostics và không tự thao tác mù.

Sentinel không thu thập hidden chain-of-thought. Context Vault chỉ dùng nội dung/status có thể quan sát từ surface người dùng và telemetry kỹ thuật đã giới hạn.
