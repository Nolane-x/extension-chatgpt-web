# Vigilume — ChatGPT Web Supervisory Runtime

**Vigilume** là Chrome Extension biến nhiều tab ChatGPT Web thành một **runtime có thể quan sát sâu, phục hồi, xếp lệnh, điều phối worker, quản lý artifact và kết nối với AI agent cục bộ**.

Vigilume không chỉ nhìn xem nút Stop còn hay mất. Nó hợp nhất DOM, public status, CDP/Network, liveness, completion stability, tool activity, Context Vault, Safe Queue, Task Orchestrator, worker lease và artifact provenance để hiểu một phiên ChatGPT đang thực sự ở đâu trong vòng đời công việc.

> **Repository:** `https://github.com/Nolane-x/gptweb`  
> **Phiên bản:** `0.3.2`  
> **Tên sản phẩm:** **Vigilume**  
> **Chrome:** 120+ / Manifest V3  
> **MCP:** `2026-07-28`  
> **Ngôn ngữ mặc định:** Tiếng Việt; có English mode  
> **Mặc định an toàn:** Automation tắt, Native Bridge tắt, agent chỉ có `observe` + `open`.

---

## ⚠️ Miễn trừ trách nhiệm

Vigilume là **dự án độc lập**, không phải sản phẩm của OpenAI và không được OpenAI tài trợ, chứng thực, phê duyệt hoặc liên kết chính thức. `OpenAI`, `ChatGPT` và các nhãn hiệu liên quan thuộc chủ sở hữu tương ứng.

Phần mềm được cung cấp **“AS IS” / nguyên trạng**. ChatGPT Web có thể thay đổi theo account, model và UI rollout; các cơ chế như evidence fusion, `DOM_DRIFT`, lease guard và fail-closed giúp giảm rủi ro nhưng không bảo đảm tự động hóa luôn chính xác hoặc luôn tương thích.

Khi bật Native Bridge, MCP, automation hoặc cấp quyền cho AI agent, **người dùng chịu trách nhiệm về scope đã cấp, prompt/action được gửi, file được tải xuống, dữ liệu được xử lý và việc tuân thủ điều khoản dịch vụ/pháp luật áp dụng**. Vigilume không tự thực thi file tải về và không bypass login, rate limit, usage limit hay access control.

Trong phạm vi tối đa pháp luật cho phép, tác giả/maintainer/contributor không chịu trách nhiệm đối với thiệt hại gián tiếp, hệ quả, mất dữ liệu, mất quyền truy cập tài khoản hoặc gián đoạn công việc phát sinh từ việc sử dụng phần mềm.

Đọc bản đầy đủ: **[`DISCLAIMER.md`](DISCLAIMER.md)**. Nội dung miễn trừ này không phải tư vấn pháp lý.

---

# Vì sao Vigilume hữu ích thật sự?

## 1. Biết ChatGPT đang làm gì — không đoán bằng cảm giác

Một phản hồi dài có thể gần như đứng hình nhưng ChatGPT vẫn đang suy nghĩ sâu, nghiên cứu hoặc chạy tool. Vigilume phân biệt các state như:

`IDLE` · `SUBMITTED` · `QUEUED` · `THINKING` · `DEEP_THINKING` · `STREAMING` · `TOOL_RUNNING` · `WAITING_USER` · `COMPLETING` · `COMPLETED` · `CONNECTION_LOST` · `RATE_LIMITED` · `CONVERSATION_LIMIT` · `STALLED` · `FAILED` · `DOM_DRIFT`.

**`DEEP_THINKING` không bị coi là treo và không được retry.** Đây là khác biệt quan trọng giữa một supervisor có state truth và một auto-clicker dựa trên timeout.

Từ v0.3.2, completion settle không còn phụ thuộc vào một DOM mutation ngẫu nhiên. Nếu ChatGPT đã dừng generation, có response thật, có non-empty answer và completion control, Vigilume sẽ re-observe đúng sau settle window để xác nhận `COMPLETING → COMPLETED` thay vì có thể mắc ở `COMPLETING` vô hạn khi DOM đứng yên.

## 2. Mất kết nối không còn đồng nghĩa với phải ngồi canh

Recovery Engine có thể:

- nhận biết connection loss/stall thật;
- kiểm liveness lại trước retry;
- chờ bằng bounded exponential backoff;
- không retry khi turn vẫn có generation/tool/status evidence;
- giữ scheduled action qua MV3 service-worker suspend bằng storage + alarms;
- dùng single-flight guard để timer và alarm không thực thi cùng action hai lần.

## 3. Safe Prompt Queue — giao việc tiếp theo mà không chen ngang

Bạn hoặc một agent có thể xếp prompt trong khi ChatGPT vẫn bận:

```text
ChatGPT đang Deep Research
        ↓
Queue: “Sau khi xong, chạy test rồi tạo release.”
        ↓
Vigilume chờ state an toàn
        ↓
Re-observe → guard → send
```

Queue được lưu durable và có thể đi qua conversation handoff.

Trong **Session Microscope**, ô **Prompt tiếp theo** có hai workflow khác nhau:

- **Thêm vào Safe Queue** — prompt được gửi khi session ở `IDLE` hoặc `COMPLETED`;
- **Tự gửi khi HOÀN TẤT** — tạo một automation one-shot, khóa đúng tab hiện tại, chờ state `COMPLETED` rồi gửi prompt.

Draft trong ô Prompt tiếp theo được giữ qua dashboard refresh; Vigilume bảo toàn value, focus và caret thay vì phá input sau mỗi 2,5 giây.

## 4. Conversation đạt giới hạn vẫn có thể tiếp tục có kiểm soát

Khi xuất hiện `CONVERSATION_LIMIT`, Vigilume có thể tạo một chat mới và bàn giao **visible context** đã giới hạn deterministic:

- mục tiêu;
- các turn gần đây;
- artifact references;
- continuation instruction.

Vigilume không bypass context/usage limit; nó mở một conversation mới và chuyển context công khai mà người dùng có thể nhìn thấy.

## 5. Artifact trở thành tài sản sử dụng được

Artifact Intelligence hợp nhất:

- file card/link trong DOM;
- filename/extension;
- MIME;
- `Content-Disposition` từ CDP Network;
- Chrome Download events;
- GitHub repo/commit/PR/tree/blob URL.

Hỗ trợ archive, document, source, media và binary. Người/agent có thể tải một file, tải hàng loạt, xem download state và truy ngược artifact về task/worker/conversation nguồn.

## 6. Nhiều ChatGPT trở thành một worker pool

Task Orchestrator cho phép gom nhiều tab vào cùng một công việc:

```text
Task: Ship release
│
├─ Worker A — research / DEEP_THINKING
├─ Worker B — coding / COMPLETED
├─ Worker C — test / TOOL_RUNNING
│
├─ Checkpoint graph
├─ Artifact Inbox
└─ Recovery Plan
```

Agent không cần tự giữ một đống `tabId`; nó có thể thao tác ở cấp task.

## 7. Lease chống hai agent giẫm lệnh nhau

Mỗi worker có thể có một **lease độc quyền** với:

- owner ID/type;
- TTL 5 giây–10 phút;
- heartbeat;
- expiry/revoke;
- explicit release.

Agent không thể takeover lease hợp lệ của agent khác. Human takeover chỉ có trong Mission Control và **không xuất hiện trong MCP**.

`task_send` / `task_queue_send` yêu cầu đồng thời:

1. capability scope phù hợp;
2. task `ACTIVE`;
3. worker còn attached;
4. lease ID đúng;
5. owner ID đúng;
6. lease còn hiệu lực.

## 8. Checkpoint graph giúp task resume

Checkpoint là append-only và hỗ trợ:

`CREATED` · `PROGRESS` · `HANDOFF` · `RECOVERY` · `ARTIFACT` · `DECISION` · `FAILURE` · `COMPLETED` · `MANUAL`.

Nếu tab bị đóng, worker chuyển `detached`, nhưng task/checkpoint/artifact history vẫn được giữ để thay worker hoặc resume.

## 9. Recovery Planner giải thích “nên làm gì tiếp theo”

Planner có thể trả:

`WAIT` · `RETRY` · `HANDOFF` · `REPLACE` · `HUMAN_REVIEW` · `NONE`.

Planner chỉ đưa recommendation; nó không tự click DOM. Execution vẫn phải qua session/lease/action guards.

## 10. AI Bridge mạnh nhưng không có god mode

Native Bridge tùy chọn cung cấp:

```text
Local AI Agent / CLI
        │
        ├─ JSON-RPC / HTTP
        ├─ Event stream
        └─ MCP 2026-07-28
               │
        Vigilume Native Bridge
               │ Native Messaging
        Chrome Extension
               │
        ChatGPT Web tabs
```

Extension vẫn là authority cuối. Mặc định agent chỉ có `observe` + `open`.

## 11. Automation theo state hoặc đúng thời gian

Trang **Tự động hóa** cho phép chọn rõ:

- ChatGPT tab đích;
- trigger **Sau khi thấy state** hoặc **Đúng thời gian**;
- state như `COMPLETED`, `IDLE`, `STALLED`…;
- thời gian local bằng `datetime-local`;
- prompt;
- delay sau state;
- max runs;
- bật Automation Engine ngay sau khi lưu.

Time rule được lưu durable bằng `chrome.storage.local` + `chrome.alarms`. Nếu service worker ngủ rồi thức lại, rule chưa chạy được restore; overdue one-shot rule có thể chạy lại một lần nếu chưa từng được thực thi.

**Timed send mặc định không chen ngang một turn đang bận.** Đến giờ hẹn, Vigilume đưa prompt vào Safe Queue; nếu ChatGPT đang `THINKING`, `DEEP_THINKING`, `STREAMING` hoặc `TOOL_RUNNING`, prompt chờ tới state an toàn rồi mới được gửi.

## 12. Nhìn thấy extension đang gửi ở bước nào

Session Microscope có **Luồng gửi lệnh** riêng. Trace không lưu prompt body; nó chỉ hiển thị các stage kỹ thuật cần để audit.

Ví dụ send thành công:

```text
SEND_PRECHECK
→ SEND_COMPOSING
→ SEND_DISPATCHED
→ SEND_ACCEPTED
```

Safe Queue:

```text
QUEUE_CREATED
→ QUEUE_SCHEDULED
→ QUEUE_RECHECK
→ QUEUE_CLAIMED
→ SEND_*
→ QUEUE_EXECUTED
```

Automation theo giờ có thể hiện:

```text
AUTOMATION_TRIGGERED
→ AUTOMATION_QUEUED
→ QUEUE_*
→ SEND_*
→ AUTOMATION_EXECUTED
```

Nếu bị guard chặn hoặc có lỗi, trace hiện các stage như `SEND_BLOCKED`, `QUEUE_DEFERRED`, `QUEUE_FAILED`, `AUTOMATION_FAILED`. Context Timeline trong Microscope cũng được cập nhật liên tục khi màn hình đang mở.

---

# NUI Mission Control

## Observatory Console

Dành cho toàn bộ ChatGPT tabs:

- state + confidence;
- turn/phase duration;
- evidence gần nhất;
- session health;
- Deep Observe;
- recovery countdown;
- Safe Queue count;
- artifact count;
- DOM drift status.

## Session Microscope

Dành cho một phiên:

- state/evidence sâu;
- Context Vault timeline cập nhật khi đang mở;
- **Luồng gửi lệnh** privacy-safe;
- Prompt tiếp theo không mất draft khi refresh;
- **Thêm vào Safe Queue**;
- **Tự gửi khi HOÀN TẤT**;
- bounded diagnostics;
- Stop;
- Retry có backoff;
- conversation handoff;
- artifact/download controls.

## Mission Control — Công việc

Dành cho task nhiều worker:

- tạo task + mục tiêu;
- bind/detach worker;
- worker role/state;
- lease owner + TTL;
- Acquire Best Worker;
- Acquire / Release lease;
- explicit Human Takeover;
- send / Safe Queue bằng human lease;
- Recovery Plan;
- checkpoint history;
- task-level Artifact Inbox;
- pause/activate/complete task.

Task không `ACTIVE` không có control giao việc mới và backend fail-closed với `TASK_NOT_ACTIVE`.

---

# Kiến trúc quan sát 4 tầng

## Tầng 1 — Tab lifecycle

Theo dõi mọi `https://chatgpt.com/*` tab trong Chrome profile hiện tại: create/close/navigation/conversation/session restore/watchdog discovery.

## Tầng 2 — Semantic DOM Observer

Theo dõi các tín hiệu người dùng nhìn thấy: composer, user/assistant turns, Stop/completion controls, public status, tool activity, waiting/approval surface, errors/limits và artifact controls.

Vigilume **không cố trích hidden chain-of-thought**.

## Tầng 3 — CDP Deep Observer

Khi bật Deep Observe, Vigilume dùng `chrome.debugger` làm CDP transport cho Network, Runtime/Page lifecycle, Performance, bounded diagnostics và trusted input dispatch.

`debugger` là permission mạnh; Vigilume chỉ attach ChatGPT tabs.

## Tầng 4 — Evidence Fusion

Không một selector đơn lẻ nào là source of truth. State engine hợp nhất generation control, response DOM, assistant/status mutation, tool/research progress, network pulse, completion action, grace/stability windows và error/limit surface.

---

# DOM Drift Guard

ChatGPT Web thay đổi UI thường xuyên. Vigilume cố phân biệt “UI đổi” với “turn treo”. Ví dụ:

- response DOM từng tồn tại rồi biến mất;
- response surface tồn tại nhưng completion rỗng bất thường;
- generation dừng + answer có text nhưng completion control mất quá grace period.

Những tình huống này vào `DOM_DRIFT`; auto retry mù bị chặn và diagnostics được giữ bounded.

---

# Task Orchestrator

Task graph gồm:

```text
TaskRecord
├─ WorkerBinding[]
├─ LeaseRecord[]
├─ Checkpoint[]
└─ ArtifactRef[]
```

Persistence dùng IndexedDB local. Một số database/storage key giữ **legacy identifier** từ phiên bản cũ để không làm mất dữ liệu khi đổi thương hiệu; chúng không phải tên sản phẩm hoặc security authority.

Xem [`docs/task-orchestrator.md`](docs/task-orchestrator.md).

---

# AI Agent / MCP

Native Bridge bind cứng `127.0.0.1:17892`.

Endpoints:

- `GET /health`
- `POST /rpc`
- `GET /events`
- `POST /mcp`

HTTP/MCP yêu cầu bearer token local.

## 39 MCP tools

### 23 ChatGPT/automation tools

Bao gồm list/observe/diagnose/wait/open/compose/send/queue/stop/retry/handoff/artifact/download/context và automation management.

### 16 Task tools

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

Chi tiết: [`docs/protocol.md`](docs/protocol.md).

---

# Capability scopes

| Scope | Quyền chính |
| --- | --- |
| `observe` | list/observe/wait/diagnose/focus/list queue/artifact |
| `open` | mở ChatGPT tab |
| `compose` | điền composer chưa gửi |
| `send` | send/queue/handoff; task send vẫn cần lease |
| `stop` | dừng turn |
| `retry` | retry có guard/backoff |
| `download` | tải artifact/đọc DownloadItem |
| `context_read` | đọc Context Vault |
| `context_delete` | xóa Context Vault |
| `automation_write` | quản lý automation |
| `task_read` | đọc task/worker/checkpoint/artifact/recovery |
| `task_write` | tạo/cập nhật task, bind/detach, checkpoint |
| `task_lease` | acquire/heartbeat/release/acquire-best |

Mặc định chỉ `observe` + `open`.

---

# Cài đặt extension

## Từ release ZIP

1. Tải `vigilume-v0.3.2-extension.zip`.
2. Giải nén.
3. Mở `chrome://extensions`.
4. Bật **Developer mode**.
5. Chọn **Load unpacked** và trỏ tới thư mục vừa giải nén.
6. Mở `chatgpt.com`.
7. Bấm icon Vigilume để mở Side Panel.

## Từ source

```bash
git clone https://github.com/Nolane-x/gptweb.git
cd gptweb
npm test
npm run verify
```

Sau đó Load unpacked thư mục repo.

---

# Native Bridge — tùy chọn

Vigilume vẫn hoạt động nếu không cài Native Bridge. Bridge chỉ cần khi agent/CLI ngoài trình duyệt muốn gọi Vigilume.

Yêu cầu Node.js 20+.

1. Giải nén `vigilume-v0.3.2-native-bridge.zip`.
2. Copy Extension ID từ `chrome://extensions`.
3. Chạy installer.

Windows:

```bat
install_host.bat YOUR_EXTENSION_ID
```

macOS/Linux:

```bash
./install_host.sh YOUR_EXTENSION_ID
```

4. Bật **Cổng AI → Native Bridge**.
5. Chỉ cấp những scope agent thực sự cần.

Native Messaging host chính là `com.vigilume.bridge`. Extension v0.3.1+ có fallback tạm thời tới legacy host cũ để người dùng nâng cấp không bị mất bridge ngay; installer mới chỉ tạo registration Vigilume.

Token mới nằm tại `~/.vigilume/bridge-token.json`.

Xem [`native-host/README.md`](native-host/README.md).

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
- version parity extension/package/native bridge;
- Vigilume branding + gptweb repository identity;
- runtime references + JavaScript syntax;
- relative imports;
- remote hosted JS/eval prohibition;
- 39 MCP tools + task scopes;
- Native Bridge shared registry + loopback policy;
- legacy host fallback migration;
- Task Orchestrator contracts;
- Mission Control wiring;
- checkpoint `DECISION`/`FAILURE` parity;
- disclaimer inclusion;
- deterministic ZIP builder.

Packager tạo:

```text
dist/
├─ vigilume-v0.3.2-extension.zip
├─ vigilume-v0.3.2-native-bridge.zip
├─ vigilume-v0.3.2-source.zip
└─ SHA256SUMS.txt
```

GitHub Verify ghi `verification/latest.json` chỉ sau khi tests + verifier + deterministic package + checksum đều PASS. GitHub Release workflow còn ghi `verification/release-v0.3.2.published.json` sau khi `gh release view` xác nhận Release object thật.

---

# Bảo mật & quyền riêng tư

- Host permission chỉ `https://chatgpt.com/*`.
- `debugger` chỉ attach ChatGPT tabs.
- Native Bridge bind loopback.
- HTTP/MCP yêu cầu bearer token.
- Native Messaging manifest khóa đúng Extension ID, không wildcard.
- Agent action được kiểm capability scope tại extension.
- Task action có lease guard.
- Human takeover không nằm trong MCP.
- Automation/Recovery/Handoff/Bridge mặc định không tự bật.
- Context local-first.
- `DOM_DRIFT` không auto-click mù.
- Vigilume không bypass login/rate/usage/access control.
- Vigilume không tự execute file tải về.

Xem [`SECURITY.md`](SECURITY.md) và [`DISCLAIMER.md`](DISCLAIMER.md).

---

# Điều đã kiểm chứng và điều không được phép nói quá

Unit/static/integration CI có thể chứng minh state logic, completion settle, form-state preservation, queue, automation scheduling, action trace, lease, task graph, protocol parity, native bridge startup, packaging và UI contracts.

Nhưng ChatGPT Web thay đổi theo account/model/UI rollout. Vigilume không tuyên bố mọi selector đã E2E-pass trên mọi tài khoản nếu không có browser evidence từ phiên đăng nhập thật tương ứng.

Thiết kế vì vậy ưu tiên:

- fail-closed;
- evidence fusion;
- `DOM_DRIFT`;
- explicit capability + lease;
- bounded diagnostics;
- không silent fallback sang click gần đúng.

---

# Tài liệu

- [`docs/protocol.md`](docs/protocol.md) — Agent/MCP wire contract.
- [`docs/task-orchestrator.md`](docs/task-orchestrator.md) — Task Orchestrator.
- [`docs/task-control-plane.md`](docs/task-control-plane.md) — Task Control Plane.
- [`SECURITY.md`](SECURITY.md) — security model.
- [`DISCLAIMER.md`](DISCLAIMER.md) — miễn trừ trách nhiệm.
- [`CHANGELOG.md`](CHANGELOG.md) — lịch sử phiên bản.
- [`RELEASE_NOTES_v0.3.2.md`](RELEASE_NOTES_v0.3.2.md) — bugfix/automation release v0.3.2.

---

## Tóm tắt một câu

**Vigilume biến nhiều ChatGPT Web tab từ các cửa sổ độc lập thành một runtime có state truth, recovery, Safe Queue, scheduled automation, action trace, artifact workflow, task graph, lease authority, Mission Control và MCP cho AI agent — nhưng vẫn ưu tiên quyền kiểm soát của người dùng và fail-closed khi UI không còn chắc chắn.**

Vigilume là phần mềm độc lập, không liên kết hay được OpenAI chứng thực. Xem [`DISCLAIMER.md`](DISCLAIMER.md).
