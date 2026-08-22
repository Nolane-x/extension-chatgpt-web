# Nolane Sentinel — ChatGPT Web Supervisory Runtime

**Nolane Sentinel** là Chrome Extension biến các tab ChatGPT Web đang mở thành một **hệ thống có thể quan sát sâu, điều khiển, phục hồi, điều phối nhiều worker và kết nối với AI agent cục bộ**.

Nó không chỉ hỏi “nút Stop còn hay mất”. Sentinel hợp nhất DOM, trạng thái hiển thị công khai, CDP/Network, thời gian ổn định, tool activity, artifact/file, Context Vault, watchdog, task graph và lease authority để hiểu ChatGPT đang thực sự ở đâu trong vòng đời công việc.

> **Phiên bản:** `0.3.0`  
> **Ngôn ngữ mặc định:** Tiếng Việt; có English mode  
> **Nền tảng:** Chrome 120+ / Manifest V3  
> **MCP:** `2026-07-28`  
> **Mặc định an toàn:** Automation tắt, AI Bridge tắt, agent chỉ có `observe` + `open`.

---

## Vì sao Nolane Sentinel có ích thật sự?

### 1. Biết ChatGPT đang làm gì — không đoán bằng cảm giác

Một phản hồi dài có thể gần như đứng hình nhưng ChatGPT vẫn đang suy nghĩ sâu, nghiên cứu, dùng tool hoặc chờ dữ liệu. Sentinel phân biệt các state như:

`IDLE` · `THINKING` · `DEEP_THINKING` · `STREAMING` · `TOOL_RUNNING` · `WAITING_USER` · `COMPLETING` · `COMPLETED` · `CONNECTION_LOST` · `RATE_LIMITED` · `CONVERSATION_LIMIT` · `STALLED` · `FAILED` · `DOM_DRIFT`.

Điểm quan trọng: **`DEEP_THINKING` không được coi là treo và không được retry**. Điều này tránh lỗi rất đắt: gửi lại prompt đúng lúc ChatGPT vẫn đang thực hiện một công việc dài.

### 2. Mất kết nối không còn đồng nghĩa với phải ngồi canh

Recovery Engine có thể:

- nhận biết lỗi mạng/stall thật;
- chờ theo bounded exponential backoff;
- kiểm tra lại liveness trước retry;
- khóa retry nếu generation/status/tool evidence cho thấy turn vẫn sống;
- giữ lịch recovery bằng `chrome.storage` + `chrome.alarms` qua MV3 service-worker suspend;
- dùng single-flight guard để timer RAM và alarm không thực thi cùng action hai lần.

### 3. Xếp việc tiếp theo mà không chen ngang turn đang chạy

**Safe Prompt Queue** cho phép người hoặc agent xếp prompt từ trước. Sentinel chỉ gửi khi phiên thực sự an toàn.

```text
ChatGPT đang Deep Research
        ↓
Queue: “Sau khi xong, chạy test và tạo release.”
        ↓
Sentinel chờ state an toàn
        ↓
Re-observe → guard → send
```

Queue bền vững qua service-worker restart và có thể đi qua conversation handoff.

### 4. Conversation chạm giới hạn vẫn có thể tiếp tục có kiểm soát

Khi xuất hiện `CONVERSATION_LIMIT`, Sentinel có thể:

1. lấy context nhìn thấy gần nhất;
2. giữ mục tiêu/các turn gần đây/artifact references;
3. giới hạn payload deterministic;
4. mở ChatGPT mới;
5. chờ composer sẵn sàng;
6. gửi Context Handoff;
7. tiếp tục prompt đang chờ.

Sentinel không bypass usage/context limits. Nó chỉ tạo một cuộc trò chuyện mới và bàn giao context công khai mà người dùng nhìn thấy.

### 5. File ChatGPT tạo ra trở thành artifact dùng được

Artifact Intelligence hợp nhất nhiều nguồn evidence:

- file card/link trong DOM;
- `download` attribute;
- filename/extension;
- MIME;
- `Content-Disposition` từ CDP Network;
- Chrome Download events;
- GitHub repo/commit/PR/tree/blob URL.

Hỗ trợ các nhóm phổ biến như ZIP/7z/RAR/TAR, PDF/Office/CSV, JSON/YAML/Markdown, source code, ảnh/media và binary.

Người dùng hoặc agent có thể:

- tải một artifact;
- tải hàng loạt artifact của phiên;
- xem trạng thái download;
- lấy đường dẫn local từ Chrome DownloadItem;
- xem artifact thuộc worker/task nào trong **Task Artifact Inbox**.

### 6. Nhiều tab ChatGPT trở thành một worker pool

Từ v0.3.0, **Task Orchestrator** gom nhiều ChatGPT vào cùng một công việc:

```text
Task: Release v0.3
│
├─ Worker A — nghiên cứu / DEEP_THINKING
├─ Worker B — coding / COMPLETED
├─ Worker C — test / TOOL_RUNNING
│
├─ Checkpoint graph
├─ Artifact Inbox
└─ Recovery plan
```

Thay vì agent phải tự nhớ từng `tabId`, nó có thể làm việc ở cấp **task**.

### 7. Lease ngăn hai agent hoặc người+agent giẫm lệnh nhau

Mỗi worker có thể được giữ bởi một **lease độc quyền**.

Lease có:

- owner ID;
- owner type (`agent` / `human`);
- TTL 5 giây–10 phút;
- heartbeat;
- expiry/revoke;
- explicit release.

Một agent không thể tự takeover lease hợp lệ của agent khác. Human takeover chỉ là thao tác explicit trong Mission Control và **không xuất hiện trong MCP**.

`task_send` / `task_queue_send` cần đồng thời:

1. capability scope phù hợp;
2. task đang `ACTIVE`;
3. worker không detached;
4. lease ID đúng;
5. owner ID đúng;
6. lease chưa hết hạn/revoke.

### 8. Task có thể resume thay vì chết cùng một tab

Task Orchestrator lưu checkpoint append-only:

- `PROGRESS`
- `HANDOFF`
- `DECISION`
- `FAILURE`

Checkpoint có thể tham chiếu worker, context và artifact. Nếu một tab bị đóng, worker chuyển `detached`, nhưng task/checkpoint/artifact history vẫn còn.

### 9. Recovery Planner đưa quyết định cấp task

Planner có thể đề xuất:

`WAIT` · `RETRY` · `HANDOFF` · `REPLACE` · `HUMAN_REVIEW` · `NONE`.

Planner **không tự click DOM**. Nó tách “quyết định nên làm gì” khỏi “thực thi action”, nên dễ audit và fail-closed hơn.

### 10. AI agent có cổng rất mạnh nhưng không có “god mode”

Native Bridge tùy chọn cung cấp:

```text
Local AI Agent / CLI
        │
        ├─ JSON-RPC / HTTP
        ├─ Event stream
        └─ MCP 2026-07-28
               │
        Nolane Native Bridge
               │ Native Messaging
        Chrome Extension
               │
        ChatGPT Web tabs
```

Extension vẫn là authority cuối. Bridge không tự thao tác ChatGPT nếu extension không cho phép.

---

# NUI Mission Control

Side Panel chính có hai cấp quan sát:

## Observatory Console

Dành cho toàn bộ ChatGPT tabs:

- state + confidence;
- thời gian turn/phase;
- evidence gần nhất;
- session health;
- Deep Observe status;
- recovery countdown;
- Safe Queue count;
- artifact count;
- DOM drift status.

## Session Microscope

Dành cho một phiên cụ thể:

- state/evidence sâu;
- Context Vault timeline;
- diagnostics;
- Stop;
- Retry có backoff;
- conversation handoff;
- artifact/download controls.

## Mission Control — Công việc

Dành cho task nhiều worker:

- tạo task + mục tiêu;
- bind/detach ChatGPT worker;
- worker role + state;
- lease owner + TTL;
- **Acquire Best Worker**;
- Acquire / Release lease;
- explicit **Tiếp quản** lease agent;
- send / Safe Queue bằng human lease;
- Recovery Plan;
- checkpoint history;
- task-level Artifact Inbox;
- pause/activate/complete task.

Task không `ACTIVE` sẽ không hiện control giao việc mới; backend cũng fail-closed với `TASK_NOT_ACTIVE`.

Mission Control sử dụng cùng visual system với Observatory thay vì tạo một “AI neon dashboard” riêng. Hierarchy chính là: **Task → Worker → Authority → Action → Evidence**.

---

# Kiến trúc quan sát 4 tầng

## Tầng 1 — Tab Sentinel

Theo dõi tất cả `https://chatgpt.com/*` tab trong Chrome profile hiện tại:

- tạo/đóng tab;
- navigation;
- conversation ID;
- session restore;
- watchdog discovery.

## Tầng 2 — Semantic DOM Observer

Theo dõi các tín hiệu người dùng có thể nhìn thấy:

- composer;
- user/assistant turns;
- Stop/completion controls;
- public thinking/research status;
- tool activity;
- approval/waiting surface;
- errors/limits;
- artifact/file controls.

Sentinel không cố trích hidden chain-of-thought.

## Tầng 3 — CDP Deep Observer

Khi bật **Deep Observe**, Sentinel dùng `chrome.debugger` làm CDP transport cho:

- `Network` activity;
- Runtime/Page lifecycle;
- Performance metrics;
- bounded page diagnostics;
- trusted `Input.insertText`/keyboard/mouse dispatch.

`debugger` là permission mạnh và Chrome sẽ hiển thị cảnh báo. Sentinel chỉ attach ChatGPT tabs.

## Tầng 4 — Evidence Fusion

Không một selector/tín hiệu đơn lẻ nào được xem là sự thật tuyệt đối. State engine hợp nhất:

- generation/Stop control;
- response DOM;
- assistant/status mutations;
- public tool/research progress;
- CDP network pulse;
- completion action;
- grace/stability window;
- error/limit surface.

---

# State machine

| State | Ý nghĩa | Auto retry |
| --- | --- | --- |
| `IDLE` | Sẵn sàng nhận prompt | Không cần |
| `SUBMITTED` / `QUEUED` | Prompt đã gửi/chờ generation | Không |
| `THINKING` | Có liveness/progress | **Không** |
| `DEEP_THINKING` | Im lặng lâu nhưng generation còn sống | **Không** |
| `STREAMING` | Answer đang thay đổi | **Không** |
| `TOOL_RUNNING` | Tool/research đang chạy | **Không** |
| `WAITING_USER` | Cần input/approval | Không |
| `COMPLETING` | Chờ completion settle | Không |
| `COMPLETED` | Đã qua stability gate | Không |
| `CONNECTION_LOST` | Có evidence mất kết nối | Có guard |
| `STALLED` | Hết liveness quá threshold | Có guard |
| `FAILED` | Turn terminal error | Có guard |
| `RATE_LIMITED` | Usage/rate surface | Không retry mù |
| `CONVERSATION_LIMIT` | Chat/context chạm giới hạn | Handoff nếu bật |
| `DOM_DRIFT` | UI structure có dấu hiệu thay đổi | **Không retry mù** |

---

# DOM Drift Guard

ChatGPT Web thay đổi UI thường xuyên. Sentinel phân biệt “UI đổi” với “ChatGPT bị treo”. Ví dụ:

- response DOM từng tồn tại rồi biến mất;
- response surface tồn tại nhưng hoàn tất rỗng bất thường;
- generation dừng + answer có text nhưng completion control không xuất hiện trong grace period.

Những trường hợp này vào `DOM_DRIFT`, có bounded diagnostics và không silent-fallback sang click/gửi mù.

---

# Task Orchestrator

## Domain

```text
TaskRecord
├─ id / title / goal / status
├─ workerIds[]
└─ headCheckpointId

WorkerBinding
├─ taskId
├─ tabId / conversationId
├─ role
├─ lastKnownState
├─ leaseId
└─ detachedAt

LeaseRecord
├─ workerId
├─ ownerId / ownerType
├─ issuedAt / heartbeatAt / expiresAt
└─ revokedAt / reason

Checkpoint
├─ parentId
├─ kind / summary
├─ workerId / contextRef
└─ artifactIds[]
```

## Persistence

IndexedDB database:

`nolane-sentinel-orchestrator-v1`

Stores:

- `tasks`
- `workers`
- `leases`
- `checkpoints`
- `artifacts`

Lõi task graph không phụ thuộc trực tiếp vào Chrome APIs; Chrome adapter chỉ làm I/O/session/action wiring.

## Worker selection

Worker scoring xem xét:

- state;
- health;
- queue depth;
- lease conflict;
- conversation continuity;
- intent.

Các trạng thái bận/rủi ro bị loại khỏi send selection mặc định.

---

# Artifact Intelligence

Sentinel không coi một dòng text `file.zip` là file thật nếu không có evidence đủ mạnh.

Artifact families:

- `archive`
- `document`
- `source`
- `media`
- `binary`
- `github`

Task-level artifact provenance giữ quan hệ:

```text
Task
  → Worker
    → Tab / Conversation
      → Session Artifact
        → Download state
```

---

# Context Vault

Context Vault lưu local:

- normalized session snapshot;
- state timeline;
- action/recovery/queue/download events;
- artifact references;
- agent action audit.

Retention modes:

- **Full visible context**;
- **Telemetry only**;
- **Không lưu**.

Retention days: 1 / 7 / 30 / 90.

Nội dung hidden chain-of-thought không được thu thập.

---

# AI Agent / MCP

Native Bridge bind cứng:

`127.0.0.1:17892`

Endpoints:

- `GET /health`
- `POST /rpc`
- `GET /events`
- `POST /mcp`

HTTP/MCP yêu cầu bearer token local.

## 39 MCP tools

### Tab/session tools

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

### Automation tools

- `automation_list`
- `automation_set_enabled`
- `automation_save`
- `automation_delete`

### Task tools

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

Chi tiết wire contract: [`docs/protocol.md`](docs/protocol.md).

---

# Capability scopes

| Scope | Quyền chính |
| --- | --- |
| `observe` | list/observe/wait/diagnose/focus/list queue/list artifact |
| `open` | mở ChatGPT tab |
| `compose` | điền composer chưa gửi |
| `send` | send/queue/conversation handoff; task send vẫn cần lease |
| `stop` | dừng turn |
| `retry` | retry có guard/backoff |
| `download` | tải artifact/đọc DownloadItem |
| `context_read` | đọc Context Vault |
| `context_delete` | xóa Context Vault |
| `automation_write` | tạo/sửa/bật/tắt/xóa automation |
| `task_read` | đọc task/worker/checkpoint/artifact/recovery |
| `task_write` | tạo/cập nhật task, bind/detach worker, checkpoint |
| `task_lease` | acquire/heartbeat/release/acquire-best worker |

Mặc định chỉ `observe` + `open`.

Cổng AI render trực tiếp canonical `AGENT_SCOPES`, nên UI permission không có một danh sách scope viết tay riêng dễ bị lệch protocol.

---

# Cài đặt extension

## Từ release ZIP

1. Tải và giải nén `nolane-sentinel-v0.3.0-extension.zip`.
2. Mở `chrome://extensions`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked**.
5. Chọn thư mục vừa giải nén.
6. Mở `chatgpt.com`.
7. Bấm icon Nolane Sentinel để mở Side Panel.

## Từ source

```bash
git clone https://github.com/Nolane-x/extension-chatgpt-web.git
cd extension-chatgpt-web
npm test
npm run verify
```

Sau đó Load unpacked thư mục repo.

---

# Native Bridge — tùy chọn

Extension vẫn chạy nếu không cài Native Bridge. Bridge chỉ cần khi một agent/CLI ngoài trình duyệt muốn quan sát/điều khiển Sentinel.

Yêu cầu Node.js 20+.

1. Giải nén `nolane-sentinel-v0.3.0-native-bridge.zip`.
2. Mở `chrome://extensions` và copy Extension ID.
3. Cài host bằng đúng ID đó.

### Windows

```bat
install_host.bat YOUR_EXTENSION_ID
```

### macOS / Linux

```bash
./install_host.sh YOUR_EXTENSION_ID
```

4. Bật **Cổng AI → Native Bridge**.
5. Chỉ bật những capability scope agent cần.

Installer đăng ký user-level và khóa `allowed_origins` vào đúng Extension ID, không wildcard.

Gỡ cài đặt:

```text
uninstall_host.bat
uninstall_host.sh
```

Xem [`native-host/README.md`](native-host/README.md).

---

# Phím tắt

- `Alt+Shift+N` — mở ChatGPT mới.
- `Alt+Shift+P` — pause/resume automation.

---

# Development / Verification

Yêu cầu Node.js 20+.

```bash
npm test
npm run verify
npm run check
npm run package
npm run release:check
```

Verifier kiểm:

- Manifest V3 / Chrome 120+;
- manifest/package/native-host version parity;
- runtime file references;
- JavaScript syntax;
- relative import existence;
- remote hosted JS/eval prohibition;
- 39 MCP tools + task scopes;
- Native Bridge shared task registry;
- Task Orchestrator modules/contracts;
- Mission Control modules/wiring;
- `TASK_NOT_ACTIVE` fail-closed guard;
- Node 20 native ZIP ESM contract;
- deterministic ZIP builder.

Packager tạo:

```text
dist/
├─ nolane-sentinel-v0.3.0-extension.zip
├─ nolane-sentinel-v0.3.0-native-bridge.zip
├─ nolane-sentinel-v0.3.0-source.zip
└─ SHA256SUMS.txt
```

và mirror vào `release/v0.3.0/` khi release workflow chạy.

GitHub Verify workflow ghi `verification/latest.json` chỉ sau khi test + verify + package + checksum đều PASS.

GitHub Release workflow sau publish còn chạy `gh release view` và ghi `verification/release-v0.3.0.published.json` để chứng minh Release object + asset metadata tồn tại thật.

---

# Bảo mật & quyền riêng tư

- Host permission chỉ `https://chatgpt.com/*`.
- `debugger` không attach các website khác.
- Native Bridge chỉ bind loopback.
- HTTP/MCP yêu cầu bearer token ngẫu nhiên local.
- Native Messaging manifest khóa đúng Extension ID.
- Agent authority được kiểm tra tại extension.
- Task authority có thêm lease guard.
- Human takeover không xuất hiện trong MCP.
- Automation/Recovery/Handoff/Bridge mặc định không tự bật.
- Context local-first.
- `DOM_DRIFT` không auto-click mù.
- Sentinel không bypass login/rate/usage/access control.
- Sentinel không tự execute file tải về.
- Diagnostics được giới hạn; không dump hidden reasoning.

Xem [`SECURITY.md`](SECURITY.md).

---

# Điều đã kiểm chứng và điều không được phép nói quá

CI/unit/static verification có thể chứng minh state logic, leases, queue, task graph, protocol parity, native bridge startup, packaging và UI contracts.

Nhưng **ChatGPT Web thay đổi theo account/model/UI rollout**. Repo không tuyên bố mọi selector đã E2E-pass trên mọi tài khoản nếu không có browser evidence từ một phiên ChatGPT đăng nhập thật tương ứng.

Vì vậy thiết kế ưu tiên:

- fail-closed;
- evidence fusion;
- `DOM_DRIFT`;
- explicit authority/lease;
- bounded diagnostics;
- không silent fallback sang click gần đúng.

---

# Tài liệu trong repo

- [`docs/protocol.md`](docs/protocol.md) — Agent/MCP wire contract.
- [`docs/task-orchestrator.md`](docs/task-orchestrator.md) — Task Orchestrator core.
- [`docs/task-control-plane.md`](docs/task-control-plane.md) — Task Control Plane / authority.
- [`SECURITY.md`](SECURITY.md) — security model.
- [`CHANGELOG.md`](CHANGELOG.md) — lịch sử phiên bản.
- [`RELEASE_NOTES_v0.3.0.md`](RELEASE_NOTES_v0.3.0.md) — release notes v0.3.0.

---

## Tóm tắt một câu

**Nolane Sentinel biến nhiều ChatGPT Web tab từ những cửa sổ độc lập thành một runtime có state truth, recovery, artifact workflow, task graph, lease authority, Mission Control và cổng MCP cho AI agent — nhưng vẫn ưu tiên quyền kiểm soát của người dùng và fail-closed khi UI không còn chắc chắn.**

Nolane Sentinel là phần mềm độc lập, không liên kết hay được OpenAI chứng thực.
