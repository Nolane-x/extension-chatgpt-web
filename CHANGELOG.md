# Changelog

## 0.2.0 — 2026-08-21

### Quan sát & state truth
- Thêm `DOM_DRIFT` health gate với grace cho response biến mất, completion rỗng và completion control mất.
- Observer phân biệt DOM tồn tại với answer text tồn tại.
- Bổ sung public Deep Research/progress status vào generation liveness.
- Thêm structured CDP diagnostics và session health.
- Thêm watchdog 30 giây + debugger reattach cooldown.

### Điều khiển & tự động hóa
- Thêm Safe Prompt Queue bền vững qua storage/alarms.
- Queue có thể đi qua Context Handoff khi conversation đạt giới hạn.
- Thêm agent `wait_until` tối đa 25 giây.
- Thêm audit event cho agent action started/succeeded/failed.

### Artifact
- Thêm bulk download tất cả file artifact của một phiên.
- UI hiển thị download state và bulk action.

### Agent bridge
- MCP tools mới: diagnose, wait, queue, cancel queue, list queue, bulk download.
- Giữ capability scopes độc lập; không thêm global agent authority.

### UI
- Observatory Console hiển thị health, queue count, DOM drift, diagnose và Session Microscope queue composer.
- Automation screen có durable queue ledger.

### Release
- Baseline release nâng lên **Chrome 120+** để watchdog 30 giây có platform guarantee.
- Native Bridge có installer/uninstaller user-level cho Windows, macOS và Linux.
- ZIP release deterministic, không phụ thuộc binary `zip` ngoài.
- Bump lên 0.2.0.
- Thêm deterministic ZIP packaging + SHA256SUMS.
- README tiếng Việt viết lại theo lợi ích/workflow thực tế.
