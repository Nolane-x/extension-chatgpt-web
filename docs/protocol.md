# Vigilume Agent Protocol v0.3

## Boundary

Extension là authority cuối về tab/state/action. Native Bridge không tự động hóa ChatGPT trực tiếp; nó chỉ chuyển yêu cầu đã xác thực sang extension qua Chrome Native Messaging. Quyền cuối cùng luôn do `agentScopes` trong extension quyết định.

Task Control Plane bổ sung một authority thứ hai cho action cấp task: **lease hợp lệ trên worker**. Có `send` scope nhưng lease sai/hết hạn/revoked vẫn không được gửi.

Task work còn có state guard: `task_acquire_best_worker`, `task_send` và `task_queue_send` chỉ hợp lệ khi task ở `ACTIVE`; task `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED` fail-closed với `TASK_NOT_ACTIVE`.

## JSON-RPC/HTTP

Endpoint: `POST http://127.0.0.1:17892/rpc`

Header:

```text
Authorization: Bearer <token>
Content-Type: application/json
```

Ví dụ tab-level:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "chatgpt.queue_send",
  "params": { "tabId": 123, "text": "Tiếp tục sau khi hoàn tất" }
}
```

Ví dụ task-level:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "task_acquire_best_worker",
  "params": {
    "taskId": "task_...",
    "ownerId": "agent-coder-1",
    "ttlMs": 30000
  }
}
```

## Event stream

`GET /events` dùng SSE riêng của Vigilume để phát các event như:

- `state.changed`
- `session.pulse`
- `queue.changed`
- `download.created`
- `download.changed`
- `recovery.scheduled`
- `bridge.status`
- `task.created`
- `task.updated`
- `task.worker.bound`
- `task.worker.detached`
- `task.lease.acquired`
- `task.lease.heartbeat`
- `task.lease.released`
- `task.checkpoint.created`
- `task.session.synced`
- `task.action.sent`
- `task.action.queued`

Đây không phải MCP legacy SSE transport.

## MCP 2026-07-28

Endpoint: `POST /mcp`.

Bắt buộc:

```text
MCP-Protocol-Version: 2026-07-28
Mcp-Method: <json-rpc method>
Mcp-Name: <tool name khi tools/call>
Authorization: Bearer <token>
```

Mỗi request phải mang protocol metadata trong `params._meta`.

Bridge hỗ trợ `server/discover`, `tools/list`, `tools/call`.

Task MCP schema dùng chung `src/core/task-protocol.js` ở extension và Native Bridge. Release native companion cũng đóng gói module này để tránh hai registry bị lệch.

## Capability scopes

| Scope | Khả năng |
| --- | --- |
| `observe` | list/observe/wait/diagnose/focus/list queue/list artifact/list automation |
| `open` | mở ChatGPT tab mới |
| `compose` | điền composer, chưa gửi |
| `send` | send/queue/cancel queue/conversation handoff + `task_send`/`task_queue_send` khi lease hợp lệ |
| `stop` | dừng turn |
| `retry` | retry có guard/backoff |
| `download` | tải một/tất cả artifact, đọc DownloadItem |
| `context_read` | đọc Context Vault |
| `context_delete` | xóa Context Vault |
| `automation_write` | bật/tắt/tạo/sửa/xóa automation |
| `task_read` | list/get task, wait worker, list task artifact, recovery plan |
| `task_write` | create/update task, bind/detach worker, tạo checkpoint |
| `task_lease` | acquire/heartbeat/release lease, acquire best worker |

Mặc định ba task scope **không được cấp**. Capability là authority boundary, không chỉ là ẩn/hiện nút UI.

`task_send` và `task_queue_send` cố ý vẫn yêu cầu `send`, không dùng `task_write`. Nghĩa là agent có thể quản lý metadata/task graph mà không tự động có quyền gửi prompt.

## Worker lease contract

Lease là khóa quyền thao tác một worker ChatGPT:

- TTL clamp 5 giây–10 phút;
- một worker chỉ có một lease còn hiệu lực;
- same owner có thể heartbeat/extend;
- lease expired/revoked không thể hồi sinh bằng heartbeat trễ;
- agent không takeover agent khác;
- `taskHumanTakeover` chỉ là command nội bộ UI và **không tồn tại trong MCP**;
- `task_send` / `task_queue_send` kiểm `taskId + workerId + leaseId + ownerId` trước action.

Production lease record dùng `revokedAt + expiresAt` làm nguồn sự thật về liveness; UI không giả định phải có một trường `status` riêng.

Flow khuyến nghị cho agent:

```text
task_acquire_best_worker
        ↓
worker + lease
        ↓
task_send / task_queue_send
        ↓
task_wait
        ↓
task_heartbeat_lease (nếu công việc kéo dài)
        ↓
task_release_lease
```

## Worker selection contract

`task_acquire_best_worker` không chọn ngẫu nhiên. Core loại hard các worker:

- detached;
- không còn live session;
- lease thuộc owner khác;
- `DOM_DRIFT`;
- `THINKING`, `DEEP_THINKING`, `STREAMING`, `TOOL_RUNNING`, `COMPLETING` cho send mới;
- recovery state khi policy không cho phép.

Sau đó score theo state, health, queue depth, conversation continuity và lease reuse. Tie-break deterministic.

## Task recovery contract

`task_recovery_plan` chỉ đưa recommendation, không tự click:

- `HUMAN_REVIEW`
- `HANDOFF`
- `REPLACE`
- `RETRY`
- `WAIT`
- `NONE`

`DOM_DRIFT` luôn đi `HUMAN_REVIEW`. Long-running states như `DEEP_THINKING` đi `WAIT`, không retry.

## State contract

Agent không nên tự suy luận “ChatGPT đã xong” từ text. Dùng `session.state` + `confidence` + `evidence` + `health`.

- `DEEP_THINKING`: không retry.
- `TOOL_RUNNING`: không retry.
- `WAITING_USER`: cần approval/input hoặc policy riêng.
- `CONNECTION_LOST` / `FAILED` / `STALLED`: có thể retry khi guard cho phép.
- `CONVERSATION_LIMIT`: dùng handoff nếu muốn tiếp tục.
- `DOM_DRIFT`: không auto retry; nên gọi `chatgpt_diagnose`.
- `COMPLETED`: đã qua completion settle gate.

## Safe Queue contract

`chatgpt_queue_send` không gửi ngay khi tab đang bận. Queue được persist trong `chrome.storage.local`.

Flow:

```text
queue_send -> queued -> state safe -> durable schedule -> re-observe -> send
                                      -> conversation limit + handoff -> new chat + context + queued prompt
```

`task_queue_send` đứng thêm một lớp phía trên: caller phải có valid task lease trước khi queue item được tạo.

## Wait contract

`chatgpt_wait_until` và `task_wait` nhận `states[]` + `timeoutMs`, tối đa 25 giây mỗi call để nằm dưới Native Bridge request timeout.

`task_wait` resolve `workerId → tabId` tại runtime, nên agent không phải giữ tab ID riêng sau khi đã có worker binding.

## Checkpoint contract

`task_checkpoint` tạo checkpoint append-only. Task chỉ đổi `headCheckpointId`; checkpoint cũ không bị sửa.

Kind hỗ trợ:

- `CREATED`
- `PROGRESS`
- `HANDOFF`
- `RECOVERY`
- `ARTIFACT`
- `DECISION`
- `FAILURE`
- `COMPLETED`
- `MANUAL`

Checkpoint có thể tham chiếu Context Vault (`tabId`, `conversationId`) và task artifact IDs.

## Artifact/download contract

Tab-level:

- `chatgpt_list_artifacts`
- `chatgpt_download_artifact`
- `chatgpt_download_all_artifacts`
- `chatgpt_get_download`

Task-level:

- `task_list_artifacts`

Task artifact giữ provenance `(workerId, sessionArtifactId, tabId, conversationId, source, checkpointId)` và cập nhật download state mà không làm mất nguồn phát hiện ban đầu.

## Diagnose contract

`chatgpt_diagnose` trả public session state/health, CDP telemetry, bounded page structural diagnostics, bounded Performance metrics và diagnostic DOM drift gần nhất. Diagnose không có hidden reasoning extraction và không dump toàn bộ page HTML.

## Audit contract

Yêu cầu agent có target tab tạo timeline event:

- `agent.action.started`
- `agent.action.succeeded`
- `agent.action.failed`

Task mutations tự phát `task.*` event qua cùng Native Bridge event stream. Audit không tự ghi toàn bộ prompt vào agent event.

## Native Bridge migration v0.3.1

Native Messaging host chính là `com.vigilume.bridge`. Extension thử host này trước; nếu companion v0.3.0 chưa được nâng cấp, extension có thể fallback tạm thời tới legacy host `com.nolane.sentinel_bridge`.

Fallback này chỉ phục vụ tương thích nâng cấp. Installer hiện hành chỉ tạo `com.vigilume.bridge`; uninstaller dọn cả current + legacy registration.

## MCP tools — 39 tools

### ChatGPT / automation — 23

- `chatgpt_list_tabs`
- `chatgpt_observe`
- `chatgpt_diagnose`
- `chatgpt_wait_until`
- `chatgpt_open`
- `chatgpt_compose`
- `chatgpt_send`
- `chatgpt_queue_send`
- `chatgpt_list_queue`
- `chatgpt_cancel_queued`
- `chatgpt_stop`
- `chatgpt_retry`
- `chatgpt_continue_new_chat`
- `chatgpt_list_artifacts`
- `chatgpt_download_artifact`
- `chatgpt_download_all_artifacts`
- `chatgpt_get_download`
- `chatgpt_get_context`
- `chatgpt_delete_context`
- `automation_list`
- `automation_set_enabled`
- `automation_save`
- `automation_delete`

### Task Orchestrator — 16

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
