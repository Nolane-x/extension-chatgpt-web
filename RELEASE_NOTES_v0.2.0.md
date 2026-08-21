# Nolane Sentinel v0.2.0 — Release Notes

Bản 0.2.0 chuyển Sentinel từ vertical slice sang một supervisory runtime cứng cáp hơn cho ChatGPT Web nhiều tab.

## Điểm nổi bật

- **DOM Drift Guard:** không nhầm UI thay đổi với turn chết.
- **Safe Prompt Queue:** xếp lệnh tiếp theo trong lúc ChatGPT vẫn đang suy nghĩ; chỉ gửi khi state an toàn.
- **Deep Research liveness:** public research/progress status được tính vào bằng chứng “vẫn đang làm”.
- **Watchdog:** tự refresh/re-attach observer với cooldown mỗi 30 giây.
- **Agent Wait/Diagnose:** agent có thể chờ state mục tiêu hoặc lấy bounded CDP diagnostics.
- **Bulk Artifact Download:** tải toàn bộ file thật trong một session.
- **Agent Audit Trail:** action qua bridge có started/succeeded/failed event kèm scope và duration.
- **NUI Observatory Console:** health, queue, diagnose và artifact workflow được đưa vào UI chính.

## Cài đặt / nền tảng

- Baseline release nâng lên **Chrome 120+** để watchdog 30 giây có platform guarantee.
- Native Bridge có installer/uninstaller user-level cho Windows, macOS và Linux.
- ZIP release deterministic, không phụ thuộc binary `zip` ngoài.

## Artifacts

- `nolane-sentinel-v0.2.0-extension.zip`
- `nolane-sentinel-v0.2.0-native-bridge.zip`
- `nolane-sentinel-v0.2.0-source.zip`
- `SHA256SUMS.txt`

## Verification boundary

Release được kiểm tra bằng Node test suite, static extension verifier, native bridge integration test và package checksum. Live ChatGPT UI compatibility vẫn phụ thuộc rollout/account và phải được coi là evidence riêng; khi selector drift, Sentinel ưu tiên `DOM_DRIFT`/degraded state thay vì thao tác mù.
