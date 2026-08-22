# Nolane Sentinel v0.2.1 — Hardening Release

v0.2.1 tập trung vào **idempotency và release evidence**. Không mở rộng quyền agent; mục tiêu là làm những hành động đã có an toàn hơn khi Chrome MV3 đánh thức service worker từ nhiều nguồn gần như đồng thời.

## Điểm sửa quan trọng

### Scheduled Action Single-Flight

Sentinel dùng cả local timer và `chrome.alarms` để một action vẫn sống qua service-worker suspend. Trước bản này, hai callback có thể đến sát nhau và cùng nhìn thấy một scheduled action.

v0.2.1 thêm `createSingleFlightGuard()`:

- claim key xảy ra đồng bộ trước `await` đầu tiên;
- callback thứ hai cùng key bị từ chối ngay;
- action chỉ chạy khi durable scheduled record còn tồn tại;
- callback đến muộn sau khi record đã được claim nhận `missing_durable_action` và không thao tác ChatGPT;
- queue/recovery/automation/handoff dùng chung guard này.

Điều này giảm rủi ro gửi prompt hai lần, retry hai lần hoặc handoff hai chat khi timer và alarm cùng đánh thức worker.

### Recovery Reschedule

Nếu state cho phép Retry nhưng chính thao tác Retry trên UI thất bại:

1. Sentinel ghi `recovery.failed` vào timeline;
2. clear recovery lease hiện tại;
3. nếu chưa đạt `maxAttempts`, tạo recovery attempt tiếp theo bằng bounded backoff;
4. lỗi vẫn được surface thay vì bị nuốt.

### Release Object Proof

Release workflow giờ không dừng ở tag + artifact mirror. Sau `gh release create/upload`, workflow bắt buộc chạy `gh release view` và ghi:

`verification/release-vX.Y.Z.published.json`

Proof chứa tag, tag target, URL release, published time, draft/prerelease flags và danh sách asset. Nếu GitHub Release object không tồn tại, bước này fail và không có proof giả.

## Tests / verification

- Thêm regression tests cho single-flight guard.
- Static verifier yêu cầu single-flight runtime markers.
- Manifest, package và Native Bridge dùng chung version `0.2.1`.
- Native Bridge dùng một `VERSION` constant cho server info và `/health` để tránh version drift.
- Release vẫn phải qua: Node test suite → static/runtime verification → deterministic package → SHA-256 verification.

## Artifacts

- `nolane-sentinel-v0.2.1-extension.zip`
- `nolane-sentinel-v0.2.1-native-bridge.zip`
- `nolane-sentinel-v0.2.1-source.zip`
- `SHA256SUMS.txt`

## Compatibility boundary

Đây vẫn là Chrome 120+ / Manifest V3. Không có thay đổi capability scope hay quyền host. Live ChatGPT DOM compatibility tiếp tục được bảo vệ bằng fail-closed `DOM_DRIFT`; bản này không tuyên bố mọi account/rollout ChatGPT đã E2E-pass nếu không có browser evidence tương ứng.
