# Nolane Sentinel Agent Protocol v0.2

## Boundary

Extension là authority cuối về tab/state/action. Native bridge không tự động hóa ChatGPT trực tiếp; nó chỉ chuyển yêu cầu đã xác thực sang extension qua Chrome Native Messaging. Quyền cuối cùng luôn do `agentScopes` trong extension quyết định.

## JSON-RPC/HTTP

Endpoint: `POST http://127.0.0.1:17892/rpc`

Header:

```text
Authorization: Bearer <token>
Content-Type: application/json
```

Ví dụ:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "chatgpt.queue_send",
  "params": { "tabId": 123, "text": "Tiếp tục sau khi hoàn tất" }
}
```

## Event stream

`GET /events` dùng SSE riêng của Sentinel để phát các event như:

- `state.changed`
- `session.pulse`
- `queue.changed`
- `download.created`
- `download.changed`
- `recovery.scheduled`
- `bridge.status`

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

## Capability scopes

| Scope | Khả năng |
| --- | --- |
| `observe` | list/observe/wait/diagnose/focus/list queue/list artifact/list automation |
| `open` | mở ChatGPT tab mới |
| `compose` | điền composer, chưa gửi |
| `send` | send/queue/cancel queue/conversation handoff |
| `stop` | dừng turn |
| `retry` | retry có guard/backoff |
| `download` | tải một/tất cả artifact, đọc DownloadItem |
| `context_read` | đọc Context Vault |
| `context_delete` | xóa Context Vault |
| `automation_write` | bật/tắt/tạo/sửa/xóa automation |

Capability là authority boundary, không chỉ là ẩn/hiện nút UI.

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

Queue item có `id`, `tabId`, `text`, `createdAt`, `expiresAt`, `status`, `source`, `handoffOnLimit`.

## Wait contract

`chatgpt_wait_until` nhận `states[]` và `timeoutMs`, tối đa 25 giây mỗi call để nằm dưới native bridge request timeout.

Ví dụ:

```json
{
  "tabId": 123,
  "states": ["COMPLETED", "FAILED", "CONVERSATION_LIMIT"],
  "timeoutMs": 20000
}
```

## Diagnose contract

`chatgpt_diagnose` trả:

- public session state/health;
- CDP telemetry;
- bounded page structural diagnostics khi Deep Observe attach được;
- bounded Performance metrics;
- diagnostic gần nhất của DOM drift.

Diagnose không có hidden reasoning extraction và không dump toàn bộ page HTML.

## Artifact/download contract

- `chatgpt_list_artifacts` liệt kê file + GitHub references.
- `chatgpt_download_artifact` tải một file.
- `chatgpt_download_all_artifacts` tải mọi artifact `kind=file` + `downloadable=true` của tab.
- `chatgpt_get_download(downloadId)` trả `state`, `filename`, `bytesReceived`, `totalBytes`, `error`, `exists`.

## Audit contract

Yêu cầu agent có target tab tạo timeline event:

- `agent.action.started`
- `agent.action.succeeded`
- `agent.action.failed`

Audit lưu action, capability scope, request ID nếu có, duration và error text bounded; không tự ghi toàn bộ prompt vào event agent audit.

## MCP tools v0.2

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
