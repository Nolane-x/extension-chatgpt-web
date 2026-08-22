# Thiết kế Task Control Plane + MCP

## Mục tiêu

Đưa Task Orchestrator Core vào runtime thật của Nolane Sentinel để người dùng và AI agent có thể quản lý công việc nhiều ChatGPT qua control plane/MCP mà không bypass các guard session hiện có.

## Kiến trúc

Tạo `src/background/orchestrator-runtime.js` làm integration boundary duy nhất giữa:

- Task Orchestrator pure core;
- IndexedDB Task Store;
- `sessions` hiện tại;
- `action-controller` / scheduler;
- control-plane / Native Bridge.

`control-plane.js` không thao tác Task Store trực tiếp. Nó gọi orchestrator runtime API.

## Runtime state

Orchestrator runtime giữ snapshot in-memory:

```js
{
  tasks: Map,
  workers: Map,
  leases: Map,
  checkpoints: Map,
  artifacts: Map,
  ready: Promise
}
```

Snapshot được hydrate một lần từ IndexedDB. Mọi mutation:

1. chạy pure-domain function;
2. persist record tương ứng;
3. cập nhật in-memory map;
4. broadcast `task.*` event.

## Task actions

Control plane bổ sung actions:

- `taskCreate`
- `taskList`
- `taskGet`
- `taskUpdate`
- `taskBindWorker`
- `taskDetachWorker`
- `taskAcquireLease`
- `taskHeartbeatLease`
- `taskReleaseLease`
- `taskAcquireBestWorker`
- `taskSend`
- `taskQueueSend`
- `taskWait`
- `taskCheckpoint`
- `taskListCheckpoints`
- `taskListArtifacts`
- `taskRecoveryPlan`

## Lease/action guard

`taskSend` và `taskQueueSend` bắt buộc params:

```js
{ taskId, workerId, leaseId, ownerId, text }
```

Flow:

1. lookup task + worker;
2. `assertWorkerLease()` ngay trước action;
3. xác nhận worker vẫn bound đúng tab;
4. refresh session snapshot;
5. `taskSend` gọi `doSend`; `taskQueueSend` gọi `queueSend`;
6. tạo checkpoint `PROGRESS` với metadata action;
7. persist + broadcast.

Không có lease hợp lệ => fail, không fallback sang tab khác.

`taskAcquireBestWorker` mới được phép chọn worker khác; sau selection nó acquire lease atomically trong một service-worker instance.

## Human takeover

Agent API không được truyền `takeover=true` với `ownerType=human`. Human takeover chỉ dành cho extension UI command `taskHumanTakeover`; action này không nằm trong MCP tool list.

## Session synchronization

Mỗi `state.changed`, `session.pulse`, download/artifact update sẽ gọi `syncOrchestratorSession(session)`:

- cập nhật `lastKnownState`, `lastSeenAt`, `conversationId` cho worker binding cùng tab;
- ingest artifacts từ session vào task artifact refs;
- không tạo task tự động;
- detached tab không xóa task history.

## Recovery plan

`taskRecoveryPlan(taskId)` trả recommendation từng worker + tổng hợp ưu tiên:

1. HUMAN_REVIEW
2. HANDOFF
3. REPLACE
4. RETRY
5. WAIT
6. NONE

Không tự execute recovery trong wave này.

## Capability scopes

Thêm scopes:

- `task_read`: list/get/checkpoints/artifacts/recovery plan;
- `task_write`: create/update/bind/detach/checkpoint;
- `task_lease`: acquire/heartbeat/release/acquire-best.

Task send/queue tiếp tục yêu cầu `send`.

Validator vẫn một required scope/action; lease guard là authority thứ hai độc lập với scope.

Mặc định không cấp ba scope task mới.

## MCP tools

Thêm 16 tools:

- `task_create`
- `task_list`
- `task_get`
- `task_update`
- `task_bind_worker`
- `task_detach_worker`
- `task_acquire_lease`
- `task_heartbeat_lease`
- `task_release_lease`
- `task_acquire_best_worker`
- `task_send`
- `task_queue_send`
- `task_wait`
- `task_checkpoint`
- `task_list_artifacts`
- `task_recovery_plan`

Tổng MCP tools dự kiến: **39**.

## Event stream

Broadcast events:

- `task.created`
- `task.updated`
- `task.worker.bound`
- `task.worker.detached`
- `task.lease.acquired`
- `task.lease.heartbeat`
- `task.lease.released`
- `task.checkpoint.created`
- `task.artifacts.changed`
- `task.action.sent`
- `task.action.queued`

Native Bridge SSE hiện có tự forward các event này.

## Persistence / restart

`bootstrapLifecycle()` phải await `initializeOrchestratorRuntime()` sau `ready` và trước discover tabs. Sau hydrate, discover/snapshot pulses sync bindings lại với live tab sessions.

Expired lease record vẫn giữ trong history nhưng selection/action guard chỉ coi lease còn hiệu lực.

## Testing

TDD bắt buộc cho:

- control action scope mappings;
- 39-tool protocol parity;
- runtime create/bind/acquire-best;
- task send reject invalid lease;
- human takeover không xuất hiện trong agent API;
- task wait dùng worker tab hiện tại;
- session sync cập nhật worker state và artifact provenance;
- recovery plan ordering;
- restart hydrate snapshot.

## Fail-closed rules

- `DOM_DRIFT` worker không được `taskAcquireBestWorker` chọn.
- `taskSend` không tự handoff khi lease fail.
- Task API không tạo hidden browser tabs ngoài explicit bind/open flow.
- Không auto-approve ChatGPT tool/confirmation UI.
- Không bypass conversation/rate/usage limits.

## Tiêu chí hoàn thành

- 39 MCP tools parity extension/native host;
- new task scopes mặc định tắt;
- Task actions có lease guard;
- orchestrator runtime hydrate/sync/persist;
- full GitHub verification proof PASS đúng commit cuối;
- mọi file đã push `main`.
