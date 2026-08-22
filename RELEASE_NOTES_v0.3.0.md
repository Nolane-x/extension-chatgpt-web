# Nolane Sentinel v0.3.0 — Multi-ChatGPT Task Orchestrator

Nolane Sentinel v0.3.0 nâng extension từ một supervisory runtime quan sát/điều khiển nhiều tab ChatGPT thành một **Task Orchestrator có worker pool, lease authority, checkpoint, artifact provenance và Mission Control**.

Bản này không thay thế các lớp Deep Observe, DOM Drift Guard, Safe Prompt Queue, Context Handoff hay Native Bridge của v0.2.x. Nó đặt một lớp điều phối cấp cao hơn lên trên các capability đó để người dùng và AI agent có thể giao một công việc dài cho nhiều ChatGPT mà vẫn biết **tab nào được quyền nhận lệnh, ai đang giữ quyền điều khiển, task đang ở đâu và artifact nào thuộc bước nào**.

## Điểm mới chính

### 1. Task Orchestrator

Mỗi công việc có:

- `TaskRecord`: title, goal, status, worker IDs và checkpoint head;
- `WorkerBinding`: tab/conversation/role/state gần nhất;
- lease độc quyền cho từng worker;
- append-only checkpoint graph;
- task-level Artifact Inbox;
- recovery recommendations;
- IndexedDB persistence để resume sau service-worker/browser restart.

Một live ChatGPT tab không thể đồng thời được bind vào hai task.

### 2. Worker lease — chống hai agent giẫm lệnh nhau

Lease có owner, TTL, heartbeat, expiry và revoke.

- TTL: 5 giây đến 10 phút;
- agent khác không thể takeover lease đang còn hiệu lực;
- human takeover là explicit action trong UI;
- human takeover **không** tồn tại trong MCP;
- Task Detail tự heartbeat lease `human-ui` khi người dùng đang vận hành;
- heartbeat race chỉ làm refresh authority mới, không đá người dùng khỏi task.

`task_send` / `task_queue_send` yêu cầu cả capability scope phù hợp **và** lease hợp lệ.

### 3. Deterministic worker selection

`Acquire Best Worker`/`task_acquire_best_worker` chọn worker dựa trên:

- ChatGPT session state;
- session health;
- queue depth;
- conversation continuity;
- lease ownership/conflict;
- intent hiện tại.

Các worker đang `DEEP_THINKING`, `STREAMING`, `TOOL_RUNNING` hoặc `DOM_DRIFT` bị loại khỏi send selection mặc định.

### 4. Resumable checkpoint graph

Task có checkpoint append-only cho:

- `PROGRESS`;
- `HANDOFF`;
- `DECISION`;
- `FAILURE`.

Checkpoint có thể giữ worker reference, context reference, artifact IDs và metadata. Khi một conversation hết giới hạn hoặc một worker bị thay, task vẫn có đường nối để tiếp tục thay vì phụ thuộc hoàn toàn vào transcript hiện tại.

### 5. Recovery Planner

Planner trả recommendation giải thích được:

- `WAIT`
- `RETRY`
- `HANDOFF`
- `REPLACE`
- `HUMAN_REVIEW`
- `NONE`

Planner không tự click DOM. Nó chỉ đưa quyết định cấp task; lớp action/recovery hiện hữu vẫn là nơi thực thi với guard.

### 6. Task-level Artifact Inbox

Artifact từ nhiều ChatGPT/conversation được gom theo task và giữ provenance:

`task → worker → tab → conversation → session artifact → download state`

Dedupe dùng `(workerId, sessionArtifactId)`. Download state có thể cập nhật mà không làm mất nguồn phát hiện ban đầu.

### 7. NUI Mission Control

Side Panel có first-class **Công việc / Tasks**:

- tạo task;
- bind/detach ChatGPT worker;
- worker state + role;
- lease owner + TTL;
- Acquire Best Worker;
- Acquire / Release / explicit Human Takeover;
- send hoặc Safe Queue chỉ khi `human-ui` giữ live lease;
- Recovery Plan;
- checkpoint history;
- Artifact Inbox;
- task status `ACTIVE`, `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED`;
- copy đầy đủ Tiếng Việt/English;
- responsive side-panel layout và reduced-motion support.

Task không `ACTIVE` không thể acquire-best/send/queue. Backend trả `TASK_NOT_ACTIVE` và UI cũng ẩn control giao việc.

### 8. MCP tăng từ 23 lên 39 tools

16 task tools mới:

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

Scopes mới:

- `task_read`
- `task_write`
- `task_lease`

Mặc định agent vẫn chỉ có `observe` + `open`. Cổng AI render trực tiếp canonical `AGENT_SCOPES`; không có global/god-mode authority.

### 9. Native Bridge parity / packaging

Extension và Native Bridge dùng chung `src/core/task-protocol.js`, vì vậy task tool schemas không bị copy thành hai nguồn sự thật.

Native Bridge ZIP mang cả:

- native host runtime;
- `src/core/task-protocol.js`;
- root `package.json` với `type: module`;

để Node.js 20 giữ đúng ESM semantics sau khi giải nén độc lập.

## Những capability v0.2.x vẫn còn nguyên

- DOM + CDP Deep Observe;
- `DEEP_THINKING` liveness guard;
- `DOM_DRIFT` fail-closed diagnostics;
- Safe Prompt Queue;
- single-flight scheduled actions;
- exponential recovery;
- conversation handoff + Context Vault;
- ZIP/PDF/source/binary/GitHub artifact intelligence;
- bulk downloads;
- Session Microscope;
- loopback-only Native Bridge + bearer token;
- MCP 2026-07-28;
- deterministic ZIP + SHA-256 release pipeline.

## Bảo mật / authority boundary

v0.3.0 giữ các nguyên tắc sau:

- không truy xuất hidden chain-of-thought;
- không bypass login, usage limit, rate limit hay access control của ChatGPT;
- `chrome.debugger` chỉ attach tab `chatgpt.com`;
- Native Bridge chỉ bind `127.0.0.1`;
- HTTP/MCP yêu cầu bearer token;
- agent action phải qua capability scope ở extension;
- task send/queue phải qua lease guard;
- human takeover không nằm trong MCP;
- `DOM_DRIFT` không auto-click/retry mù;
- file tải về không được Sentinel tự execute.

## Cài đặt / nâng cấp

### Extension

1. Tải `nolane-sentinel-v0.3.0-extension.zip`.
2. Giải nén.
3. Mở `chrome://extensions`.
4. Bật **Developer mode**.
5. Chọn **Load unpacked** và trỏ tới thư mục vừa giải nén.

### Native Bridge — tùy chọn

1. Cài Node.js 20+.
2. Giải nén `nolane-sentinel-v0.3.0-native-bridge.zip`.
3. Lấy Extension ID trong `chrome://extensions`.
4. Chạy:

Windows:

```bat
install_host.bat YOUR_EXTENSION_ID
```

macOS/Linux:

```bash
./install_host.sh YOUR_EXTENSION_ID
```

Sau đó bật **Cổng AI → Native Bridge** và chỉ cấp những scope cần thiết.

## Verification gate

Release v0.3.0 chỉ được publish khi source commit tương ứng qua đủ:

```bash
npm test
npm run verify
npm run package
sha256sum -c dist/SHA256SUMS.txt
```

Verifier kiểm:

- Manifest V3 / Chrome 120+;
- runtime references + JS syntax;
- remote-code/eval prohibition;
- 39 MCP tools;
- canonical task scopes;
- Task Orchestrator modules/contracts;
- Mission Control modules/wiring;
- Node.js 20 native packaging;
- deterministic ZIP builder.

GitHub Release workflow còn gọi `gh release view` sau publish và ghi `verification/release-v0.3.0.published.json` để chứng minh Release object + asset metadata tồn tại thật.

## Giới hạn được ghi rõ

ChatGPT Web vẫn thay đổi theo account/model/UI rollout. Unit/static/integration tests và GitHub CI không thay thế live E2E trên mọi biến thể tài khoản ChatGPT.

Sentinel vì vậy tiếp tục ưu tiên:

- evidence fusion;
- fail-closed;
- `DOM_DRIFT`;
- bounded diagnostics;
- explicit authority/lease;

thay vì giả định selector luôn đúng hoặc silently click một control gần giống.

---

**Nolane Sentinel là phần mềm độc lập, không liên kết hay được OpenAI chứng thực.**
