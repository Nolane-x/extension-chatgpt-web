# Changelog

## 0.2.1 — 2026-08-22

### Scheduler / recovery hardening
- Thêm `createSingleFlightGuard()` để local timer và `chrome.alarms` không thể cùng thực thi một scheduled action trong cùng service-worker instance.
- Scheduled callback bắt buộc phải claim được durable record; callback đến muộn nhận `missing_durable_action` và không thao tác ChatGPT.
- Recovery ghi `recovery.failed` và tự lên lịch attempt tiếp theo bằng bounded backoff nếu thao tác Retry trên UI thất bại.
- Thêm regression tests cho single-flight semantics.

### Version / verification
- Bump đồng bộ Manifest, package và Native Bridge lên `0.2.1`.
- Native Bridge dùng một `VERSION` constant cho server info và `/health`.
- Static verifier kiểm shared bridge version, single-flight module và runtime markers.

### Release evidence
- Release workflow sau `gh release create/upload` bắt buộc gọi `gh release view`.
- Workflow commit `verification/release-vX.Y.Z.published.json` với URL, published time, tag target và asset metadata; nếu Release object không tồn tại thì không có proof.

## 0.2.0 — 2026-08-22

### Quan sát & state truth
- Thêm `DOM_DRIFT` health gate với grace cho response biến mất, completion rỗng và completion control mất.
- Observer phân biệt DOM tồn tại với answer text tồn tại.
- Bổ sung public Deep Research/progress status vào generation liveness.
- Thêm structured CDP diagnostics và session health.
- Thêm watchdog 30 giây + debugger reattach cooldown.
- Session resurrection giữ lại state, timing, artifact và DOM health qua MV3 worker restart.

### Điều khiển & tự động hóa
- Thêm Safe Prompt Queue bền vững qua storage/alarms.
- Queue có thể đi qua Context Handoff khi conversation đạt giới hạn.
- Thêm agent `wait_until` tối đa 25 giây.
- Thêm audit event cho agent action started/succeeded/failed.
- Session Microscope có Stop, Retry có backoff và Handoff chat mới theo state guard.
- Partial settings patch được deep-merge để không làm mất các sibling option.
- Watchdog persist việc xóa queue của tab đã đóng, tránh prompt cũ sống lại sau worker restart.

### Artifact
- Thêm bulk download tất cả file artifact của một phiên.
- UI hiển thị download state và bulk action.
- Artifact classifier hợp nhất DOM, filename/MIME, Content-Disposition, CDP Network và Chrome Downloads.

### Agent bridge
- MCP tools mới: diagnose, wait, queue, cancel queue, list queue, bulk download.
- Giữ capability scopes độc lập; không thêm global agent authority.
- Native bridge chỉ bind loopback và browser extension giao tiếp với companion qua Native Messaging.

### UI
- Observatory Console hiển thị health, queue count, DOM drift, diagnose và Session Microscope.
- Automation screen có durable queue ledger.
- Side Panel được tách thành model/session/admin/router/actions modules, mọi text từ ChatGPT được escape trước khi render.
- Thêm visual layer riêng cho diagnostics và deep controls ở viewport side panel hẹp.

### Runtime architecture
- Tách service worker monolith thành `runtime-state`, `session-runtime`, `action-controller`, `scheduler`, `control-plane`, `lifecycle` và entrypoint nhỏ.
- Verifier kiểm toàn bộ runtime graph, relative imports, syntax, remote-code/eval policy và parity 23 MCP tools.

### Release
- Baseline release là **Chrome 120+**.
- Native Bridge có installer/uninstaller user-level cho Windows, macOS và Linux.
- ZIP release deterministic, không phụ thuộc binary `zip` ngoài; kèm `SHA256SUMS.txt`.
- Packaging tự lấy version từ `package.json` và release notes tương ứng.
- GitHub Actions ghi `verification/latest.json` sau khi test + static/runtime verify + package + checksum đều PASS.
- Release pipeline hỗ trợ trigger-file idempotent, tự mirror artifacts, tạo tag và publish/cập nhật GitHub Release.
- README tiếng Việt tập trung vào lợi ích/workflow thực tế.
