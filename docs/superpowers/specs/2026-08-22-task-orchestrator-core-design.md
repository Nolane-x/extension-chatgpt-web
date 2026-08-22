# Thiết kế Task Orchestrator Core

## Mục tiêu

Biến Nolane Sentinel từ runtime giám sát/điều khiển từng tab ChatGPT thành runtime điều phối **nhiều ChatGPT worker theo cùng một công việc**, có quyền sở hữu tạm thời, checkpoint có thể phục hồi, handoff giữa conversation và provenance artifact.

Task Orchestrator Core không thay thế session runtime hiện có. Nó đứng **phía trên** các session/tab và chỉ sử dụng các primitive đã có như observe, send, queue, retry, handoff, artifact và Context Vault.

## Phạm vi wave này

Wave này chỉ khóa và triển khai core domain + persistence. MCP/UI sẽ tích hợp ở wave kế tiếp bằng các interface công khai của core.

Bao gồm:

- `TaskRecord` và lifecycle task.
- Worker binding giữa task và tab ChatGPT.
- Lease độc quyền với TTL/heartbeat/takeover.
- Worker selection có scoring.
- Checkpoint và resumable work graph.
- Recovery recommendation ở cấp task.
- Artifact provenance ở cấp task.
- Persistence local-first và restore sau MV3 service-worker restart.

Không bao gồm trong core wave:

- scheduler phân tán ngoài máy;
- cloud backend;
- bypass giới hạn ChatGPT;
- hidden chain-of-thought;
- thực thi file artifact;
- auto-merge GitHub commit.

## Nguyên tắc bất biến

1. **Tab runtime vẫn là source of truth cho trạng thái ChatGPT.** Orchestrator không tự suy đoán lại DOM/CDP.
2. **Một worker chỉ có tối đa một lease hợp lệ tại một thời điểm.**
3. **Lease hết hạn không còn quyền điều khiển.** Mọi action nguy hiểm phải kiểm lease ngay trước khi gọi action-controller.
4. **Human takeover luôn thắng.** UI hoặc command có explicit takeover có thể thu hồi lease agent.
5. **Task không sở hữu credential/token ChatGPT.** Chỉ tham chiếu `tabId`, `conversationId` và Context Vault.
6. **Checkpoint là append-only logical history.** Update task chỉ đổi pointer `headCheckpointId`; checkpoint cũ không bị sửa.
7. **Artifact provenance không được suy từ filename đơn lẻ.** Chỉ liên kết artifact đã được session runtime phân loại.
8. **Persistence local-first.** Không gửi task/context/artifact ra server ngoài Native Bridge do người dùng bật.
9. **Không bypass usage limits.** Nếu conversation limit xuất hiện, orchestrator chỉ đề xuất/điều phối handoff hợp lệ sang chat mới.
10. **Fail closed.** Worker ở `DOM_DRIFT`, state không chắc chắn hoặc lease conflict không được auto-send.

## Domain model

### TaskRecord

```js
{
  id: string,
  title: string,
  goal: string,
  status: 'ACTIVE'|'PAUSED'|'COMPLETED'|'FAILED'|'CANCELLED',
  createdAt: number,
  updatedAt: number,
  workerIds: string[],
  headCheckpointId: string|null,
  metadata: object
}
```

### WorkerBinding

```js
{
  id: string,
  taskId: string,
  tabId: number,
  conversationId: string|null,
  role: string,
  attachedAt: number,
  detachedAt: number|null,
  leaseId: string|null,
  lastKnownState: string,
  lastSeenAt: number
}
```

`role` là nhãn do người/agent đặt như `research`, `coding`, `review`; core không hard-code semantic workflow theo role.

### LeaseRecord

```js
{
  id: string,
  workerId: string,
  ownerId: string,
  ownerType: 'human'|'agent'|'system',
  issuedAt: number,
  heartbeatAt: number,
  expiresAt: number,
  revokedAt: number|null,
  reason: string|null
}
```

Lease hợp lệ khi `revokedAt == null && now < expiresAt`.

### CheckpointRecord

```js
{
  id: string,
  taskId: string,
  parentId: string|null,
  kind: 'CREATED'|'PROGRESS'|'HANDOFF'|'RECOVERY'|'ARTIFACT'|'COMPLETED'|'MANUAL',
  createdAt: number,
  summary: string,
  workerId: string|null,
  contextRef: {tabId:number, conversationId:string|null}|null,
  artifactIds: string[],
  metadata: object
}
```

### TaskArtifactRef

```js
{
  id: string,
  taskId: string,
  workerId: string,
  sessionArtifactId: string,
  tabId: number,
  conversationId: string|null,
  name: string,
  kind: string,
  href: string|null,
  downloadId: number|null,
  detectedAt: number,
  provenance: {
    source: string,
    checkpointId: string|null
  }
}
```

## Lease semantics

### Acquire

`acquireLease(worker, owner, ttlMs, {takeover})`

- TTL clamp: 5 giây đến 10 phút.
- Nếu worker không có lease hợp lệ: cấp lease mới.
- Nếu owner đang giữ lease: heartbeat/extend và trả cùng lease.
- Nếu owner khác đang giữ lease: trả `LEASE_CONFLICT`.
- Nếu `takeover=true` và ownerType=`human`: revoke lease cũ rồi cấp lease human mới.
- Agent không được takeover agent khác trừ khi policy tương lai cho phép; core wave mặc định cấm.

### Heartbeat

Chỉ đúng `leaseId + ownerId` mới extend được. Heartbeat stale không làm sống lại lease đã expire/revoke.

### Release

Idempotent: release lease đã release vẫn trả trạng thái an toàn, không tạo lease mới.

### Action guard

`assertWorkerLease(workerId, leaseId, ownerId, now)` chạy ngay trước action-control. Worker binding phải còn attach cùng `tabId`; lease phải hợp lệ.

## Worker selection

`selectWorker(task, sessionIndex, options)` loại worker không hợp lệ trước khi scoring:

Hard exclude:

- detached;
- lease conflict với owner yêu cầu;
- `DOM_DRIFT`;
- `CONNECTION_LOST`, `FAILED`, `STALLED` nếu `allowRecovering=false`;
- tab không còn trong session runtime.

Score ưu tiên:

- `IDLE` hoặc `COMPLETED` cao nhất;
- `WAITING_USER` thấp hơn nếu action mong đợi input;
- `DEEP_THINKING`/`STREAMING` không chọn cho send mới;
- cùng conversation/task continuity được cộng điểm;
- health `healthy` > `degraded` > `critical`;
- worker ít queue hơn được ưu tiên;
- tie-break deterministic bằng `attachedAt`, sau đó `id`.

Core trả cả `worker` và `reasons` để UI/agent giải thích quyết định.

## Checkpoint / resumable graph

Mỗi mutation có ý nghĩa có thể tạo checkpoint. `parentId` mặc định là `task.headCheckpointId`, sau đó task trỏ sang checkpoint mới.

Handoff tạo checkpoint kind `HANDOFF` chứa:

- worker nguồn;
- worker/tab mới;
- old/new conversation IDs;
- contextRef;
- artifact IDs đã biết;
- lý do handoff.

Restore chỉ cần TaskStore + session runtime hiện tại. Nếu tab cũ không còn, binding chuyển detached nhưng checkpoint/history vẫn tồn tại. Task không tự tạo tab khi restore; recovery coordinator/UI/agent quyết định replace worker.

## Recovery coordinator

Core chỉ đưa **recommendation**, không tự click DOM:

`recommendWorkerRecovery(worker, session, policy)` trả một trong:

- `WAIT` — state đang hoạt động như `DEEP_THINKING`, `STREAMING`, `TOOL_RUNNING`;
- `RETRY` — connection lost/stalled và policy recovery cho phép;
- `HANDOFF` — `CONVERSATION_LIMIT` và task có checkpoint/context;
- `REPLACE` — tab mất hoặc worker critical kéo dài;
- `HUMAN_REVIEW` — `DOM_DRIFT`, lease conflict hoặc evidence không đủ;
- `NONE` — worker khỏe/rảnh.

Recommendation có `reason`, `confidence`, `notBefore` và không bypass guard hiện có.

## Artifact provenance

Orchestrator không quét DOM lại. Nó ingest artifact từ `publicSession(session).artifacts`.

`syncTaskArtifacts(taskId, workerBindings, sessions)`:

- dedupe theo `(workerId, sessionArtifactId)`;
- giữ `tabId`, `conversationId`, source;
- cập nhật `downloadId/downloadState` khi session artifact thay đổi;
- không tự tải file;
- khi artifact mới xuất hiện có thể tạo checkpoint kind `ARTIFACT` ở wave tích hợp.

Hash local file chỉ được thêm ở Native Bridge khi đường dẫn download thật tồn tại; extension core không có quyền đọc tùy ý filesystem.

## Persistence

Tạo IndexedDB riêng `nolane-sentinel-orchestrator-v1` với stores:

- `tasks` key `id`;
- `workers` key `id`, index `taskId`, `tabId`;
- `leases` key `id`, index `workerId`, `ownerId`;
- `checkpoints` key `id`, index `taskId`, `createdAt`;
- `artifacts` key `id`, index `taskId`, `workerId`.

Core API không lộ IDB transaction ra ngoài. Store adapter cung cấp CRUD/batch + `loadRuntimeSnapshot()`.

## Public core API

Các module downstream chỉ phụ thuộc API sau:

```js
createTask(input, now)
updateTask(task, patch, now)
createWorkerBinding(input, now)
detachWorker(worker, now)
acquireLease(state, input, now)
heartbeatLease(state, input, now)
releaseLease(state, input, now)
assertWorkerLease(state, input, now)
selectWorker(task, workers, sessionIndex, input, now)
createCheckpoint(task, input, now)
recommendWorkerRecovery(worker, session, policy, now)
mergeTaskArtifacts(existing, incoming)
```

Persistence adapter:

```js
openOrchestratorStore()
loadOrchestratorSnapshot()
saveTask(record)
saveWorker(record)
saveLease(record)
saveCheckpoint(record)
saveArtifacts(records)
```

## Error contract

Domain functions dùng Error với `code` ổn định:

- `TASK_NOT_FOUND`
- `WORKER_NOT_FOUND`
- `LEASE_CONFLICT`
- `LEASE_EXPIRED`
- `LEASE_REVOKED`
- `LEASE_OWNER_MISMATCH`
- `WORKER_DETACHED`
- `NO_ELIGIBLE_WORKER`
- `INVALID_TASK_STATE`

Không đưa DOM/credential/token vào error.

## Testing

TDD bắt buộc cho core behavior:

1. Lease exclusivity.
2. Lease expiry + stale heartbeat.
3. Human takeover.
4. Deterministic worker selection.
5. Exclude deep-thinking/busy/DOM drift workers.
6. Checkpoint parent/head semantics.
7. Restore graph khi worker tab biến mất.
8. Recovery recommendations.
9. Artifact provenance dedupe/update.
10. Persistence round-trip bằng fake IndexedDB adapter hoặc pure serialization boundary.

Sau core tests, `npm test`, `npm run verify`, `npm run package` và checksum phải PASS trên GitHub CI trước khi integration wave bắt đầu.

## Security / privacy

- Không lưu bearer token/ChatGPT auth trong orchestrator store.
- `ownerId` là opaque local identifier, không phải credential.
- Context chỉ tham chiếu Context Vault hiện có.
- Task metadata bị clamp/normalize ở integration boundary trước khi persist.
- Human takeover phải được explicit từ UI/command, không suy từ focus tab.
- Agent action sau này bắt buộc vừa qua capability scope, vừa qua task lease.

## Nâng cấp sau core wave

Wave 2 — Control plane / MCP:

- task create/list/get/update;
- bind/unbind worker;
- lease acquire/heartbeat/release;
- acquire best worker;
- task send/queue/wait;
- task artifacts/checkpoints/recovery plan.

Wave 3 — NUI Mission Control:

- task overview;
- worker pool;
- ownership/lease chip;
- recovery recommendation;
- artifact inbox;
- handoff/checkpoint graph;
- human takeover.

## Tiêu chí hoàn thành core wave

Core wave chỉ được coi là hoàn thành khi:

- domain API ở trên tồn tại và có test;
- lease race deterministic;
- worker selection deterministic;
- persistence restore không mất task graph;
- orchestrator không thay đổi hành vi session runtime hiện tại;
- full repo CI proof ghi PASS cho source commit cuối;
- mọi thay đổi đã push GitHub `main`.
