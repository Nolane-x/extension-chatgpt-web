# Nolane Sentinel — ChatGPT Web

**Nolane Sentinel** là Chrome Extension biến các tab ChatGPT Web đang mở thành một **hệ thống làm việc có thể quan sát, điều khiển, phục hồi và kết nối với AI agent cục bộ**.

Sentinel không chỉ hỏi “nút Stop còn hay mất”. Nó hợp nhất DOM, trạng thái hiển thị, CDP/Network, thời gian ổn định, artifact/file, Context Vault và watchdog để hiểu một phiên ChatGPT đang thực sự ở đâu trong vòng đời công việc.

> **Phiên bản:** `0.2.0`  
> **Ngôn ngữ mặc định:** Tiếng Việt  
> **Nền tảng:** Chrome 120+ / Manifest V3  
> **Mặc định an toàn:** Automation tắt, AI Bridge tắt, quyền agent chỉ `observe` + `open`.

---

## Lợi ích thật sự

### 1. Biết ChatGPT đang làm gì — không đoán bằng cảm giác

Một phản hồi dài có thể đứng hình hàng chục giây nhưng ChatGPT vẫn đang suy nghĩ, nghiên cứu, dùng tool hoặc chờ dữ liệu. Sentinel phân biệt các state như:

`THINKING` · `DEEP_THINKING` · `STREAMING` · `TOOL_RUNNING` · `WAITING_USER` · `COMPLETING` · `COMPLETED` · `CONNECTION_LOST` · `RATE_LIMITED` · `CONVERSATION_LIMIT` · `STALLED` · `DOM_DRIFT`.

Điều này giúp tránh lỗi rất đắt: **retry đúng lúc ChatGPT vẫn đang làm việc**, khiến một tác vụ dài bị nhân đôi hoặc mất tiến trình.

### 2. Mất kết nối không còn đồng nghĩa với phải ngồi canh

Khi giao diện báo lỗi mạng hoặc turn thật sự stall, Sentinel có thể:

- ghi nhận chính xác thời điểm lỗi;
- chờ theo bounded exponential backoff;
- kiểm tra lại liveness trước khi retry;
- tuyệt đối khóa retry nếu Stop/status/network vẫn chứng minh turn còn sống;
- giữ lịch recovery qua `chrome.storage` + `chrome.alarms`, kể cả service worker MV3 ngủ rồi thức lại.

### 3. Xếp lệnh tiếp theo mà không chen ngang turn đang chạy

**Safe Prompt Queue** cho phép người dùng hoặc AI agent xếp trước prompt tiếp theo. Sentinel chỉ gửi khi state an toàn (`IDLE`/`COMPLETED`).

Ví dụ: ChatGPT đang Deep Research, bạn vẫn có thể xếp:

```text
Sau khi xong, kiểm tra toàn bộ test rồi tạo release package.
```

Prompt nằm trong queue bền vững, không mất nếu extension service worker bị suspend.

### 4. Cuộc trò chuyện chạm giới hạn vẫn tiếp tục được

Khi Sentinel nhận ra `CONVERSATION_LIMIT`, tính năng handoff có thể:

1. lấy mục tiêu gần nhất;
2. lấy các turn nhìn thấy gần nhất;
3. lấy artifact/file/GitHub references;
4. giới hạn kích thước deterministic;
5. mở ChatGPT mới;
6. chờ composer thật sự sẵn sàng;
7. gửi Context Handoff + câu lệnh tiếp tục.

Nếu có Safe Queue đang chờ, prompt đó có thể đi cùng handoff sang chat mới.

### 5. File ChatGPT tạo ra trở thành workflow thật

Sentinel phát hiện artifact bằng nhiều nguồn bằng chứng:

- file card/link trong DOM;
- `download` attribute;
- extension filename;
- MIME/binary response;
- `Content-Disposition` từ CDP Network;
- Chrome Download events;
- GitHub repo/commit/PR URL được phân loại riêng.

Hỗ trợ ZIP/7z/RAR/TAR, PDF/Office, CSV, JSON/YAML/Markdown, source code, ảnh/media và nhiều binary phổ biến.

Bạn hoặc AI agent có thể:

- tải một artifact;
- **tải tất cả artifact** của phiên;
- theo dõi download state;
- lấy đường dẫn local do Chrome cung cấp qua `chatgpt_get_download`.

OpenAI hiện lưu file đã upload/tạo trong ChatGPT Library; Sentinel không thay thế Library, mà làm lớp quan sát/điều khiển ngay trên workflow chat đang chạy.

### 6. Điều khiển nhiều ChatGPT từ một Observatory Console

Chrome Side Panel hiển thị đồng thời:

- state + confidence;
- thời gian từ lúc bắt đầu turn;
- phase rail;
- evidence gần nhất;
- health (`healthy`, `degraded`, `critical`);
- recovery countdown;
- queued prompts;
- artifact;
- Deep Observe status;
- Session Microscope timeline.

### 7. UI drift được coi là lỗi cấu trúc, không phải “ChatGPT bị treo”

ChatGPT Web thay đổi UI thường xuyên. Sentinel có **DOM Drift Guard**:

- response DOM từng có rồi biến mất;
- completion surface có nhưng answer rỗng;
- generation dừng, answer có text nhưng completion control không xuất hiện trong grace period.

Những trường hợp này đi vào `DOM_DRIFT`, chụp bounded diagnostics và **không auto-retry mù**.

### 8. AI agent có một cổng mạnh nhưng vẫn bị giới hạn quyền

Native companion tùy chọn cung cấp:

```text
AI Agent
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

Agent có thể list/observe/wait/diagnose/open/compose/send/queue/stop/retry/handoff/download/context/automation tùy đúng capability scope được người dùng bật.

Không có “AI god mode”. `observe`, `send`, `download`, `context_delete`… là các quyền độc lập.

---

## Kiến trúc quan sát 4 tầng

### Tầng 1 — Tab Sentinel

Theo dõi mọi `https://chatgpt.com/*` tab trong Chrome profile hiện tại: tạo tab, đóng tab, navigation, conversation ID, restore.

### Tầng 2 — Semantic DOM Observer

Theo dõi composer, user/assistant turn, status/reasoning công khai, tool card, approval dialog, error, Stop/completion control, artifact và Deep Research/progress rows.

### Tầng 3 — CDP Deep Observer

Khi bật **Deep Observe**, Sentinel dùng `chrome.debugger` làm CDP transport để lấy:

- `Network` activity;
- `Runtime`/`Page` lifecycle;
- `Performance` metrics;
- bounded diagnostics;
- trusted `Input.insertText`/keyboard/mouse dispatch cho deep control.

Chrome 120+ là baseline release: debugger session có thể giữ MV3 service worker sống, đồng thời alarm granularity 30 giây cho watchdog hoạt động đúng thiết kế.

### Tầng 4 — Evidence Fusion

Không signal đơn lẻ nào được coi là sự thật tuyệt đối. State machine hợp nhất:

- Stop/generation control;
- answer DOM/text mutation;
- public status/tool progress;
- CDP network pulse;
- completion action;
- timer/grace window;
- error/limit surface.

---

## Deep Control

Sentinel có thể thao tác trực tiếp ChatGPT Web:

- mở/focus tab;
- focus composer;
- điền prompt bằng CDP `Input.insertText`;
- chia prompt dài theo chunk mà không cắt surrogate pair Unicode;
- gửi;
- stop;
- retry có state guard;
- xếp Safe Queue;
- mở chat mới + handoff context;
- click/download artifact.

Mọi action quan trọng đều có post-observation và timeline/audit trail.

---

## State machine

| State | Ý nghĩa | Auto retry |
| --- | --- | --- |
| `IDLE` | Sẵn sàng nhận prompt | Không cần |
| `SUBMITTED` / `QUEUED` | Đã gửi, chờ turn bắt đầu | Không |
| `THINKING` | Có liveness/progress | **Không** |
| `DEEP_THINKING` | Im lặng lâu nhưng generation vẫn sống | **Không** |
| `STREAMING` | Answer đang đổi/tăng | **Không** |
| `TOOL_RUNNING` | Tool/research activity đang chạy | **Không** |
| `WAITING_USER` | Chờ approval/input | Không |
| `COMPLETING` | Đang chờ completion ổn định | Không |
| `COMPLETED` | Đã qua settle gate | Không |
| `CONNECTION_LOST` | Lỗi kết nối có evidence | Có, nếu guard cho phép |
| `STALLED` | Hết liveness quá threshold | Có, nếu guard cho phép |
| `FAILED` | Turn lỗi terminal | Có, nếu guard cho phép |
| `RATE_LIMITED` | Limit sử dụng/tốc độ | Không retry mù |
| `CONVERSATION_LIMIT` | Chat/context đạt giới hạn | Handoff sang chat mới |
| `DOM_DRIFT` | UI/selector có dấu hiệu thay đổi | **Không retry mù** |

---

## Safe Prompt Queue

Queue theo mô hình:

```text
Queue → persist → observe state → guard → durable alarm → re-observe → send/handoff
```

Mỗi queue item có ID, target tab, thời điểm tạo, thời hạn, status, nguồn và policy `handoffOnLimit`.

Agent tools:

- `chatgpt_queue_send`
- `chatgpt_list_queue`
- `chatgpt_cancel_queued`

---

## Watchdog

Watchdog mặc định bật và chạy mỗi 30 giây:

- query lại ChatGPT tabs;
- reattach Deep Observer nếu cần;
- có cooldown để không spam attach khi DevTools/Chrome đang giữ debugger;
- refresh snapshot;
- kích hoạt DOM drift diagnostic khi cần;
- dọn Context Vault cũ theo retention.

---

## Artifact Intelligence

Sentinel **không** coi một dòng text “file.zip” là file thật nếu không có evidence đủ mạnh.

Artifact families:

- `archive` — zip/7z/rar/tar/gz…
- `document` — pdf/docx/xlsx/pptx/csv…
- `source` — js/ts/py/go/rust/json/yaml/md…
- `media` — image/audio/video…
- `binary`
- `github` — repo/commit/pull/tree/blob riêng biệt.

Bulk workflow: `chatgpt_download_all_artifacts`.

---

## Context Vault

IndexedDB lưu local:

- session summary;
- normalized snapshot;
- state timeline;
- action/recovery/queue/download events;
- artifact references;
- agent action audit.

Chế độ lưu:

- **Full visible context**;
- **Telemetry only**;
- **Không lưu**.

Retention: 1/7/30/90 ngày.

Sentinel không cố lấy hidden chain-of-thought. Chỉ nội dung/status người dùng nhìn thấy trên trang mới được đưa vào context.

---

## Agent API / MCP

Native bridge bind cứng `127.0.0.1:17892` và yêu cầu bearer token.

Endpoints:

- `GET /health`
- `POST /rpc`
- `GET /events`
- `POST /mcp`

MCP pin protocol `2026-07-28`.

### Tool nổi bật

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
- `automation_*`

Chi tiết: [`docs/protocol.md`](docs/protocol.md).

---

## Capability scopes

| Scope | Quyền |
| --- | --- |
| `observe` | list/observe/wait/diagnose/focus/list queue/list artifact |
| `open` | mở ChatGPT mới |
| `compose` | điền composer, chưa gửi |
| `send` | send/queue/handoff |
| `stop` | dừng turn |
| `retry` | retry có guard |
| `download` | tải một/tất cả artifact, đọc DownloadItem |
| `context_read` | đọc Context Vault |
| `context_delete` | xóa Context Vault |
| `automation_write` | tạo/sửa/bật/tắt/xóa automation |

Mặc định chỉ `observe` + `open`.

---

## Cài đặt extension

### Từ release ZIP

1. Giải nén `nolane-sentinel-v0.2.0-extension.zip`.
2. Mở `chrome://extensions`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked**.
5. Trỏ tới thư mục đã giải nén.
6. Mở `chatgpt.com` và bấm icon Sentinel để mở Side Panel.

### Từ source

```bash
git clone https://github.com/Nolane-x/extension-chatgpt-web.git
cd extension-chatgpt-web
npm test
npm run verify
```

Sau đó Load unpacked trực tiếp thư mục repo.

> Permission `debugger` là quyền mạnh. Chrome sẽ hiện cảnh báo. Sentinel chỉ attach tab `chatgpt.com` và có thể tắt Deep Observe bất kỳ lúc nào.

---

## Native Bridge

Native Bridge là **tùy chọn**. Extension vẫn hoạt động nếu không cài bridge.

1. Cài Node.js 20+.
2. Giải nén `nolane-sentinel-v0.2.0-native-bridge.zip`.
3. Mở `chrome://extensions`, copy **ID** của Nolane Sentinel.
4. Cài host bằng đúng Extension ID đó:

**Windows**

```bat
install_host.bat YOUR_EXTENSION_ID
```

**macOS / Linux**

```bash
./install_host.sh YOUR_EXTENSION_ID
```

5. Bật **Cổng AI → Native Bridge** trong Sentinel.
6. Chỉ bật các capability scope agent thật sự cần.

Installer dùng user-level registration; `allowed_origins` được khóa vào đúng Extension ID, không wildcard. Có `uninstall_host.bat` / `uninstall_host.sh` để gỡ sạch registration.

Xem [`native-host/README.md`](native-host/README.md).

---

## Phát triển / kiểm tra / đóng gói

Yêu cầu Node.js 20+. Packager ZIP deterministic được viết trong repo, không phụ thuộc binary `zip` bên ngoài.

```bash
npm test
npm run verify
npm run check
npm run package
npm run release:check
```

Release artifacts được tạo trong `dist/` và mirror versioned tại `release/v0.2.0/`, kèm `SHA256SUMS.txt`. Workflow `Release` có thể publish trực tiếp các artifact này khi tag/dispatch `v0.2.0`.

---

## Bảo mật & quyền riêng tư

- Extension chỉ có host permission `https://chatgpt.com/*`.
- Bridge chỉ bind loopback.
- Bearer token local ngẫu nhiên.
- Agent action bị kiểm tra scope tại extension — UI/native host không phải authority cuối.
- Context local-first.
- Automation/Recovery/Handoff/Bridge không tự bật.
- DOM drift không auto-click mù.
- Sentinel không bypass login, usage limit hay access control của ChatGPT.
- Sentinel không execute file tải về.

Xem [`SECURITY.md`](SECURITY.md).

---

## Điều đã kiểm chứng và điều chưa được phép nói quá

`npm test` kiểm tra state/evidence/queue/protocol/native bridge; `npm run verify` kiểm tra manifest, runtime references, syntax, locale, remote-code prohibition và protocol parity.

**Live ChatGPT Web thay đổi theo account/model/UI rollout.** Repository chưa thể tuyên bố mọi selector đã E2E-pass trên mọi account nếu không có browser evidence từ phiên ChatGPT đăng nhập thật. Thiết kế vì vậy ưu tiên fail-closed, `DOM_DRIFT` và diagnostics thay vì silent fallback.

---

## Tài liệu nền tảng

- Chrome Extensions — `chrome.debugger`, `chrome.alarms`, service-worker lifecycle, `chrome.downloads`, Native Messaging, Side Panel.
- OpenAI Help — File storage & Library; Deep Research.
- MCP protocol `2026-07-28`.
- `miuuyy/codex-chatgpt-web` — tham chiếu về browser-turn liveness, completion settling, prompt chunking và UI drift diagnostics.

Nolane Sentinel là phần mềm độc lập, không liên kết hay được OpenAI chứng thực.
