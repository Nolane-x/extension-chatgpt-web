# Changelog

## 0.3.2 — 2026-08-22

### Completion truth
- Sửa deadlock `COMPLETING → COMPLETED`: observer dedupe snapshot ổn định từng khiến completion candidate không được re-evaluate sau settle window.
- Thêm background completion-settle coordinator: cùng candidate chỉ có một timer, candidate đổi thì reschedule, rời `COMPLETING`/đóng tab thì hủy.
- Settle timer chỉ ép **re-observation**, không ép state; state machine vẫn là authority cuối.

### Side Panel draft stability
- Sửa toàn bộ form bị reset do `viewRoot.innerHTML` refresh mỗi 2,5 giây.
- Capture/restore value, checked state, focus và caret cho input/textarea/select có `id` qua mỗi rerender.
- `Prompt tiếp theo`, automation builder và task forms không còn mất draft vì dashboard refresh.

### Action Trace / observability
- Thêm privacy-safe bounded Action Trace vào public session/Microscope; không lưu prompt body.
- Send stages: `SEND_PRECHECK`, `SEND_COMPOSING`, `SEND_DISPATCHED`, `SEND_ACCEPTED`, cùng blocked/failed variants.
- Queue stages: `QUEUE_CREATED`, `QUEUE_SCHEDULED`, `QUEUE_RECHECK`, `QUEUE_CLAIMED`, `QUEUE_DEFERRED`, `QUEUE_EXECUTED` và failure/cancel/expire/handoff variants.
- Automation stages: `AUTOMATION_TRIGGERED`, `AUTOMATION_QUEUED`, `AUTOMATION_EXECUTED`, `AUTOMATION_FAILED`.
- Session Microscope refresh Context Vault timeline liên tục khi đang mở, thay vì chỉ đọc lúc vào màn hình.

### Completion automation
- Thêm nút **Tự gửi khi HOÀN TẤT** ngay cạnh `Prompt tiếp theo` trong Session Microscope.
- Tạo one-shot rule khóa đúng tab hiện tại, `whenState=COMPLETED`, `maxRuns=1`, confidence guard và tự bật Automation Engine nếu cần.

### Scheduled prompt automation
- Automation Builder cho chọn tab đích, trigger theo state hoặc **Đúng thời gian**, `datetime-local`, prompt, delay và max runs.
- Time rule dùng storage + `chrome.alarms` + single-flight scheduler và được restore sau MV3 service-worker restart.
- Overdue one-shot rule được replay một lần nếu chưa chạy; disabled/max-runs/already-run rule không được schedule lại.
- Khi đổi `runAt`, scheduled action cũ tự no-op nhờ runAt version check.
- Timed `send` mặc định dùng **Safe Queue delivery**, vì vậy đến giờ nhưng ChatGPT đang bận sẽ không chen ngang turn.

### Regression coverage
- Thêm tests cho completion settle, Side Panel form-state, privacy-safe action trace, durable time automation và Safe Queue default delivery.
- MCP surface giữ nguyên 39 tools.

## 0.3.1 — 2026-08-22

### Product identity
- Đổi tên sản phẩm hiện hành thành **Vigilume**; repository vẫn giữ `Nolane-x/gptweb`.
- Loại tên thương hiệu cũ khỏi manifest, locale, Side Panel, README, SECURITY, Native Bridge runtime/installer, package metadata và release pipeline hiện hành.
- Package hiện hành là `vigilume-browser-runtime`.
- Artifact release mới dùng prefix `vigilume-vX.Y.Z-*`.

### Native Bridge migration
- Native Messaging host chính đổi sang `com.vigilume.bridge`.
- Extension thử host Vigilume trước và chỉ fallback tới legacy `com.nolane.sentinel_bridge` để không làm đứt companion v0.3.0 đang cài.
- Installer mới chỉ đăng ký host Vigilume; uninstaller dọn cả current + legacy registration.
- Runtime mới dùng `~/.vigilume/bridge-token.json`, `VIGILUME_PORT` và server identity `vigilume-bridge`.
- Một số legacy environment/storage identifiers được giữ có chủ đích để bảo toàn tương thích/dữ liệu; chúng không còn là branding sản phẩm.

### Disclaimer / safety communication
- Thêm `DISCLAIMER.md` đầy đủ bằng tiếng Việt, nêu rõ dự án độc lập, không được OpenAI chứng thực, phần mềm cung cấp AS IS, trách nhiệm khi cấp quyền agent, file/artifact, dữ liệu, điều khoản dịch vụ và giới hạn trách nhiệm trong phạm vi pháp luật cho phép.
- README đưa bản miễn trừ rút gọn lên gần đầu tài liệu.
- Source ZIP và Native Bridge ZIP đều mang `DISCLAIMER.md`.

### Verification
- Thêm branding regression test cho manifest/locales/package/UI/native host/release artifacts.
- Verifier khóa Vigilume branding, repo identity `Nolane-x/gptweb`, Native Bridge migration, disclaimer inclusion và artifact prefix mới.
- Native host/integration/installer/package tests được chuyển sang runtime Vigilume.

## 0.3.0 — 2026-08-22

### Multi-ChatGPT Task Orchestrator
- Thêm `TaskRecord` và `WorkerBinding` để gom nhiều tab/conversation ChatGPT vào cùng một công việc có mục tiêu, worker pool và trạng thái riêng.
- Thêm worker lease độc quyền với TTL 5 giây–10 phút, heartbeat, release idempotent và explicit human takeover.
- Agent không thể takeover lease hợp lệ của agent khác; human takeover chỉ tồn tại trong UI nội bộ, không được expose qua MCP.
- Một live ChatGPT tab không thể đồng thời thuộc hai task.
- Thêm deterministic worker selection theo session state, health, queue depth, conversation continuity và lease ownership.
- Worker `DEEP_THINKING`, `STREAMING`, `TOOL_RUNNING` và `DOM_DRIFT` bị loại khỏi send selection mặc định.
- Task `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED` bị chặn `taskSend`, `taskQueueSend` và acquire-best bằng `TASK_NOT_ACTIVE`.

### Resumability / recovery
- Thêm append-only checkpoint graph với `headCheckpointId`, context reference, handoff metadata và artifact references.
- Thêm recovery recommendation `WAIT`, `RETRY`, `HANDOFF`, `REPLACE`, `HUMAN_REVIEW`, `NONE`; core không tự click DOM.
- Conversation limit chỉ được đề xuất handoff khi có checkpoint/context có thể tiếp tục.
- Worker bị đóng tab sẽ chuyển `detached`; task/checkpoint/artifact history vẫn được giữ để resume hoặc thay worker.

### Artifact provenance / persistence
- Thêm task-level Artifact Inbox và provenance dedupe theo `(workerId, sessionArtifactId)`.
- Download state cập nhật không làm mất nguồn provenance ban đầu.
- Thêm pure snapshot codec để round-trip task graph, kể cả expired/revoked leases.
- Thêm IndexedDB `nolane-sentinel-orchestrator-v1` với stores `tasks`, `workers`, `leases`, `checkpoints`, `artifacts`.
- Thêm public facade `src/orchestrator/index.js`; UI/MCP không phụ thuộc internal scoring constants.

### Task Control Plane / MCP
- Nâng MCP surface từ **23 lên 39 tools**.
- Thêm 16 task tools: create/list/get/update, bind/detach worker, acquire/heartbeat/release lease, acquire-best, send/queue/wait, checkpoint, list artifacts và recovery plan.
- Thêm scopes `task_read`, `task_write`, `task_lease`; mặc định vẫn chỉ `observe` + `open`.
- `task_send` và `task_queue_send` vẫn bắt buộc scope `send` cộng với lease hợp lệ.
- Native Bridge và extension dùng chung `src/core/task-protocol.js`, tránh schema/tool drift.
- Native release ZIP mang `package.json` + shared task registry để Node.js 20 giữ đúng ESM semantics.
- `taskDashboard` là command nội bộ cho human UI, không làm tăng MCP authority.

### NUI Mission Control
- Thêm first-class **Công việc / Tasks** trong Chrome Side Panel.
- Task list hiển thị mục tiêu, worker count, live lease và artifact count; checkpoint bundles được lấy đầy đủ thay vì metric giả 0.
- Task Detail có worker pool, lease owner/TTL, Acquire Best Worker, explicit Human Takeover, Release, Detach worker, Recovery Plan, Checkpoint chain và Artifact Inbox.
- Task composer chỉ hiện khi task `ACTIVE` và `human-ui` thật sự giữ live lease.
- Human lease được heartbeat khi người dùng đang làm việc trong Task Detail; heartbeat race không làm văng người dùng khỏi task.
- UI hiểu đúng production lease record (`revokedAt` + `expiresAt`, không phụ thuộc trường `status` giả định).
- Cổng AI render trực tiếp `AGENT_SCOPES` canonical registry, tự có `task_read`, `task_write`, `task_lease` và không có god mode.
- Mission Control có copy đầy đủ Tiếng Việt/English, state-aware controls, responsive layout và reduced-motion support.
- Mọi dữ liệu task/worker/artifact động đều escape trước khi render.

### Verification / release hardening
- Verifier coi 11 orchestrator modules, 5 Mission Control modules, internal task dashboard wiring, canonical agent scopes, task-state guard và Node 20 native packaging là release requirements.
- Thêm integration contract cho nav → views → actions → orchestrator runtime → AI Port scope registry.
- Giữ deterministic ZIP, checksum verification và GitHub Release-object proof pipeline.

## 0.2.1 — 2026-08-22

### Scheduler / recovery hardening
- Thêm `createSingleFlightGuard()` để local timer và `chrome.alarms` không thể cùng thực thi một scheduled action trong cùng service-worker instance.
- Scheduled callback bắt buộc phải claim được durable record; callback đến muộn nhận `missing_durable_action` và không thao tác ChatGPT.
- Recovery ghi `recovery.failed` và tự lên lịch attempt tiếp theo bằng bounded backoff nếu thao tác Retry trên UI thất bại.
- Thêm regression tests cho single-flight semantics.

### Version / verification
- Bump đồng bộ Manifest, package và Native Bridge lên `0.2.1`.
- Native Bridge dùng một `VERSION` constant cho server info và `/health`.
- Static verifier kiểm shared bridge version, single-flight module và runtime markers.

### Release evidence
- Release workflow sau `gh release create/upload` bắt buộc gọi `gh release view`.
- Workflow commit `verification/release-vX.Y.Z.published.json` với URL, published time, tag target và asset metadata; nếu Release object không tồn tại thì không có proof.

## 0.2.0 — 2026-08-22

### Quan sát & state truth
- Thêm `DOM_DRIFT` health gate với grace cho response biến mất, completion rỗng và completion control mất.
- Observer phân biệt DOM tồn tại với answer text tồn tại.
- Bổ sung public Deep Research/progress status vào generation liveness.
- Thêm structured CDP diagnostics và session health.
- Thêm watchdog 30 giây + debugger reattach cooldown.
- Session resurrection giữ lại state, timing, artifact và DOM health qua MV3 worker restart.

### Điều khiển & tự động hóa
- Thêm Safe Prompt Queue bền vững qua storage/alarms.
- Queue có thể đi qua Context Handoff khi conversation đạt giới hạn.
- Thêm agent `wait_until` tối đa 25 giây.
- Thêm audit event cho agent action started/succeeded/failed.
- Session Microscope có Stop, Retry có backoff và Handoff chat mới theo state guard.
- Partial settings patch được deep-merge để không làm mất các sibling option.
- Watchdog persist việc xóa queue của tab đã đóng, tránh prompt cũ sống lại sau worker restart.

### Artifact
- Thêm bulk download tất cả file artifact của một phiên.
- UI hiển thị download state và bulk action.
- Artifact classifier hợp nhất DOM, filename/MIME, Content-Disposition, CDP Network và Chrome Downloads.

### Agent bridge
- MCP tools mới: diagnose, wait, queue, cancel queue, list queue, bulk artifact download.
- Giữ capability scopes độc lập; không thêm global agent authority.
- Native bridge chỉ bind loopback và browser extension giao tiếp với companion qua Native Messaging.

### UI
- Observatory Console hiển thị health, queue count, DOM drift, diagnose và Session Microscope.
- Automation screen có durable queue ledger.
- Side Panel được tách thành model/session/admin/router/actions modules, mọi text từ ChatGPT được escape trước khi render.
- Thêm visual layer riêng cho diagnostics và deep controls ở viewport side panel hẹp.

### Runtime architecture
- Tách service worker monolith thành `runtime-state`, `session-runtime`, `action-controller`, `scheduler`, `control-plane`, `lifecycle` và entrypoint nhỏ.
- Verifier kiểm toàn bộ runtime graph, relative imports, syntax, remote-code/eval policy và parity 23 MCP tools.

### Release
- Baseline release là **Chrome 120+**.
- Native Bridge có installer/uninstaller user-level cho Windows, macOS và Linux.
- ZIP release deterministic, không phụ thuộc binary `zip` ngoài; kèm `SHA256SUMS.txt`.
- Packaging tự lấy version từ `package.json` và release notes tương ứng.
- GitHub Actions ghi `verification/latest.json` sau khi test + static/runtime verify + package + checksum đều PASS.
- Release pipeline hỗ trợ trigger-file idempotent, tự mirror artifacts, tạo tag và publish/cập nhật GitHub Release.
- README tiếng Việt tập trung vào lợi ích/workflow thực tế.
