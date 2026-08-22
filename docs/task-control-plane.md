# Task Control Plane + MCP

Task Control Plane là lớp runtime nối **Task Orchestrator Core** với Session Runtime, Chrome actions và Native Bridge/MCP của Vigilume.

Mục tiêu của lớp này là để AI agent thao tác theo **công việc + worker + lease**, thay vì gửi trực tiếp vào một `tabId` và tự giữ hàng loạt bookkeeping bên ngoài Vigilume.

## Boundary

```text
AI agent / UI
      │
      ▼
Capability scope
      │
      ▼
Task Command Router
      │
      ▼
Task Orchestrator Service
      │
      ├─ lease guard
      ├─ worker selection
      ├─ checkpoint
      ├─ artifact provenance
      └─ recovery plan
      │
      ▼
Chrome Background Adapter
      │
      ├─ Session Runtime / publicSession
      ├─ doSend
      ├─ Safe Prompt Queue
      ├─ requestSnapshot / wait
      └─ IndexedDB Task Store
```

Task Control Plane không parse DOM ChatGPT. Nó dùng `publicSession()` làm source of truth cho state/health/evidence/artifact.

## 39 MCP tools

Native Bridge và extension dùng chung `src/core/task-protocol.js`. Tổng surface hiện tại:

- 23 tool ChatGPT/automation;
- 16 tool Task Orchestrator.

Task tools:

```text
task_create
task_list
task_get
task_update
task_bind_worker
task_detach_worker
task_acquire_lease
task_heartbeat_lease
task_release_lease
task_acquire_best_worker
task_send
task_queue_send
task_wait
task_checkpoint
task_list_artifacts
task_recovery_plan
```

`taskHumanTakeover` không nằm trong MCP.

## Ba lớp authority cho task action

Một request `task_send` phải qua ba lớp độc lập:

1. **Protocol capability** — cần scope `send`.
2. **Task router identity** — request từ Native Bridge bị ép `ownerType=agent`; không thể giả human takeover.
3. **Worker lease guard** — `taskId + workerId + leaseId + ownerId` phải khớp lease còn hiệu lực ngay trước action service.

Thiếu một lớp => action fail, không fallback sang worker khác.

## Acquire best worker

`task_acquire_best_worker` là primitive cấp cao dành cho agent. Worker đang `DEEP_THINKING`, `STREAMING`, `TOOL_RUNNING`, `COMPLETING` hoặc `DOM_DRIFT` không được chọn cho send mới.

## Bind isolation

Một live ChatGPT tab chỉ được bound vào **một task** tại một thời điểm. Nếu tab đã thuộc một task khác, `task_bind_worker` trả `WORKER_ALREADY_BOUND`.

Nếu cho cùng một tab nằm trong hai task, mỗi task có thể tạo lease riêng và cả hai cùng tin rằng mình sở hữu worker; invariant này ngăn đúng lớp race đó.

## Session synchronization

Sau mỗi Session Runtime snapshot:

1. state machine ChatGPT chạy xong;
2. `publicSession()` được tạo;
3. `runtime.hooks.orchestratorSync` sync worker bindings cùng tab;
4. cập nhật `lastKnownState`, `lastSeenAt`, `conversationId`;
5. ingest session artifacts vào task provenance store.

Download lifecycle cũng sync lại artifact khi `downloadId`, `downloadState` thay đổi.

## Tab lifecycle

Khi tab ChatGPT đóng hoặc watchdog xác nhận tab không còn tồn tại:

- live session state bị dọn;
- Safe Queue của tab được dọn theo policy hiện có;
- Task Worker Binding chuyển `detached`;
- Task, checkpoint và artifact history **không bị xóa**.

Sau restart Chrome, Task Store hydrate trước khi tab discovery bắt đầu.

## Task send

Flow:

```text
task_send
  ↓
capability = send
  ↓
lookup task/worker
  ↓
assert valid lease
  ↓
read current public session
  ↓
reject DOM_DRIFT / missing session
  ↓
doSend(tabId)
  ↓
append PROGRESS checkpoint
  ↓
broadcast task.action.sent
```

`task_queue_send` giống vậy nhưng action thực đi vào Safe Prompt Queue và tạo checkpoint `PROGRESS`.

## Task wait

Agent chỉ cần giữ `workerId`, không cần tự lưu `tabId`; Control Plane resolve worker → live tab → `requestSnapshot()` loop hiện có.

## Human takeover

Human takeover là internal UI command `taskHumanTakeover`:

- chỉ được router chấp nhận khi source không phải agent;
- cấp `ownerType=human`;
- revoke valid agent lease bằng explicit `takeover=true`;
- không tồn tại trong `MCP_TOOLS` / `TASK_ALIASES`.

NUI Mission Control hiển thị owner/TTL rõ trước thao tác **Tiếp quản**.

## Recovery plan

`task_recovery_plan` trả recommendation cho từng worker, sắp theo mức cần chú ý:

```text
HUMAN_REVIEW
HANDOFF
REPLACE
RETRY
WAIT
NONE
```

Control Plane **không tự execute** recovery plan. Bất kỳ policy executor nào về sau vẫn phải qua lease/session guards.

## Native Bridge package

Vigilume Native Bridge import shared registry:

```js
import { TASK_MCP_TOOLS, TASK_TOOL_ACTION }
  from '../src/core/task-protocol.js';
```

Native release ZIP phải giữ:

- `package.json` với `type: module`;
- `native-host/**` hiện hành;
- `src/core/task-protocol.js`;
- protocol/security/disclaimer docs.

Điều này đặc biệt quan trọng với Node.js 20: nếu thiếu package scope ESM, shared `.js` registry có thể bị hiểu sai module format.

## Security

- task scopes mặc định OFF;
- `task_send` không được cấp chỉ vì có `task_write`;
- agent không human-takeover;
- one-live-tab/one-task isolation;
- DOM drift fail-closed;
- task history local-first;
- không bypass usage/rate/conversation limits;
- không auto-approve confirmation UI của ChatGPT;
- không execute artifact tải về.
