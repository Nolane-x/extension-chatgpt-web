# Task Orchestrator Core

Task Orchestrator là lớp điều phối nằm **trên Session Runtime** của Vigilume. Session Runtime vẫn quyết định một tab ChatGPT đang `THINKING`, `DEEP_THINKING`, `STREAMING`, `DOM_DRIFT` hay `COMPLETED`; Orchestrator chỉ dùng state đó để quản lý công việc nhiều worker một cách an toàn.

## Vì sao cần Task Orchestrator

Khi chỉ có một tab, `tabId` là đủ. Khi có nhiều ChatGPT chạy song song, các vấn đề mới xuất hiện:

- hai AI agent có thể cùng gửi vào một tab;
- người dùng có thể takeover giữa lúc agent đang giữ quyền;
- conversation cũ đạt giới hạn nhưng công việc chưa xong;
- Chrome/service worker restart làm mất bookkeeping nếu chỉ giữ state trong RAM;
- file ZIP/PDF/source xuất hiện ở nhiều conversation khác nhau nhưng đều thuộc một công việc;
- worker bị mất kết nối cần quyết định chờ, retry, handoff hay thay worker.

Task Orchestrator giải quyết các vấn đề này bằng **Task + Worker + Lease + Checkpoint + Artifact provenance**.

## Task

Một `TaskRecord` có mục tiêu, trạng thái, danh sách worker và checkpoint head. Task không giữ credential ChatGPT và không chứa cookie/token.

Các trạng thái task:

- `ACTIVE`
- `PAUSED`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

## Worker Binding

Một worker liên kết task với một tab ChatGPT:

- `taskId`
- `tabId`
- `conversationId`
- `role`
- `attachedAt` / `detachedAt`
- `leaseId`
- state gần nhất

`role` chỉ là nhãn như `research`, `coding`, `review`; core không hard-code workflow theo role.

## Lease — khóa quyền điều khiển

Lease là cơ chế chống hai actor cùng thao tác một ChatGPT worker.

Bất biến quan trọng:

1. Một worker chỉ có tối đa một lease còn hiệu lực.
2. TTL bị clamp từ **5 giây đến 10 phút**.
3. Heartbeat chỉ hợp lệ với đúng `workerId + leaseId + ownerId`.
4. Lease expired/revoked không thể được heartbeat làm sống lại.
5. Agent không được takeover agent khác.
6. Human takeover explicit có thể revoke lease agent hiện tại.
7. Mọi action nguy hiểm ở integration wave phải gọi `assertWorkerLease()` ngay trước action thực thi.

## Worker Selection

`selectWorker()` chọn worker dựa trên evidence đã có từ Session Runtime.

Hard exclude mặc định cho send mới:

- worker detached;
- tab không còn session snapshot;
- lease đang thuộc owner khác;
- `DOM_DRIFT`;
- `THINKING`, `DEEP_THINKING`, `STREAMING`, `TOOL_RUNNING`, `COMPLETING`;
- recovery states nếu caller không cho phép recovering worker.

Scoring ưu tiên `IDLE`, sau đó `COMPLETED`, rồi `WAITING_USER`, kết hợp health, queue depth, conversation continuity và lease reuse. Tie-break luôn deterministic theo `attachedAt` rồi `worker.id`.

Kết quả trả cả `score` và `reasons` để UI/agent giải thích được vì sao worker được chọn.

## Recovery Recommendation

Core **không tự click**. `recommendWorkerRecovery()` chỉ trả plan:

- `WAIT` — ChatGPT vẫn đang làm hoặc đang rate limit/waiting user;
- `RETRY` — lỗi kết nối/stall có policy recovery;
- `HANDOFF` — conversation limit và có checkpoint/context;
- `REPLACE` — tab/session mất hoặc worker critical quá lâu;
- `HUMAN_REVIEW` — DOM drift hoặc không đủ điều kiện an toàn;
- `NONE` — worker ổn định.

Điều này giữ recovery coordinator explainable và fail-closed.

## Checkpoint Graph

Checkpoint là lịch sử logic append-only của task.

Mỗi checkpoint có:

- `parentId`;
- `kind`;
- `summary`;
- `workerId`;
- optional Context Vault reference;
- artifact IDs;
- metadata.

Task chỉ thay `headCheckpointId`. Checkpoint cũ không bị sửa, vì vậy handoff qua nhiều conversation vẫn truy ngược được.

Các kind hiện hỗ trợ:

`CREATED`, `PROGRESS`, `HANDOFF`, `RECOVERY`, `ARTIFACT`, `DECISION`, `FAILURE`, `COMPLETED`, `MANUAL`.

## Artifact Provenance

Orchestrator không quét DOM lần hai. Nó chỉ ingest artifact mà Session Runtime đã xác nhận.

Dedupe key:

```text
(workerId, sessionArtifactId)
```

Artifact cùng session ID nhưng từ worker khác vẫn là hai provenance khác nhau. Khi download state thay đổi, Orchestrator cập nhật `downloadId`/`downloadState` nhưng giữ nguyên `detectedAt` và nguồn provenance ban đầu.

Hash file local thuộc phạm vi Native Bridge/filesystem workflow; Chrome extension core không tự ý đọc filesystem.

## Persistence

Database hiện dùng legacy compatibility identifier:

```text
nolane-sentinel-orchestrator-v1
```

Tên này được giữ để **không làm mất task graph khi nâng cấp thương hiệu sang Vigilume**. Nó là ID lưu trữ nội bộ, không phải tên sản phẩm hoặc security authority.

Object stores:

- `tasks`
- `workers`
- `leases`
- `checkpoints`
- `artifacts`

Indexes:

- workers: `taskId`, `tabId`
- leases: `workerId`, `ownerId`
- checkpoints: `taskId`, `createdAt`
- artifacts: `taskId`, `workerId`

`store-codec.js` là pure serialization boundary để test restore graph trong Node mà không phụ thuộc browser IndexedDB.

## Public API

Downstream code chỉ nên import qua `src/orchestrator/index.js`; không import scoring constants hay internal state sets trực tiếp.

## Bảo mật

- Orchestrator không lưu ChatGPT auth/token/cookie.
- `ownerId` là local opaque identifier, không phải credential.
- Human takeover phải explicit.
- Worker `DOM_DRIFT` không được auto-send.
- Không bypass usage limits.
- Không execute artifact tải về.
- Context chỉ tham chiếu Context Vault hiện có.

## Control Plane / Mission Control

Task Control Plane bổ sung create/list/get task, bind/detach worker, acquire/heartbeat/release lease, acquire-best worker, task send/queue/wait, checkpoints/artifacts và recovery plan. NUI Mission Control hiển thị task graph, worker pool, lease owner, recovery recommendation, artifact inbox và human takeover.
