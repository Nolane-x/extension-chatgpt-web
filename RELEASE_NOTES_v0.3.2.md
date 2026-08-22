# Vigilume v0.3.2 — Completion truth, stable drafts & prompt automation

Vigilume v0.3.2 là bản **bugfix + automation usability release** tập trung trực tiếp vào các lỗi quan sát được khi dùng ChatGPT Web thật:

- ChatGPT đã kết thúc nhưng Vigilume có thể mắc ở `COMPLETING`;
- ô **Prompt tiếp theo** bị reset trong lúc người dùng đang gõ;
- người dùng không nhìn thấy rõ Vigilume đang queue/compose/send ở bước nào;
- automation theo `COMPLETED` khó sử dụng;
- chưa có prompt automation theo thời gian;
- prompt đúng giờ có nguy cơ cố gửi giữa lúc ChatGPT vẫn bận.

## 1. Sửa deadlock `COMPLETING → COMPLETED`

### Root cause

State machine cố ý yêu cầu cùng một completion signature ổn định trong khoảng settle trước khi xác nhận `COMPLETED`.

Content observer lại dedupe snapshot giống hệt nhau. Khi ChatGPT hoàn tất tốt và DOM đứng yên, snapshot đầu tiên đưa state vào `COMPLETING`, nhưng không có snapshot thứ hai để chứng minh signature vẫn ổn định.

Nghịch lý là **DOM càng ổn định thì state càng có thể mắc ở `COMPLETING`**.

### Fix

Thêm `completion-settle` coordinator ở background runtime:

1. khi state vào `COMPLETING`, ghi completion candidate;
2. đặt đúng một re-observation tại `candidate.since + completionSettleMs`;
3. cùng candidate không tạo timer trùng;
4. candidate thay đổi thì timer cũ bị thay;
5. rời `COMPLETING` hoặc tab bị đóng thì timer bị hủy;
6. poll mới đi qua state machine bình thường — không force `COMPLETED` giả.

Kết quả: completion vẫn cần stability gate, nhưng không còn phụ thuộc vào một DOM mutation ngẫu nhiên để thoát `COMPLETING`.

## 2. Sửa ô Prompt bị reset khi Side Panel refresh

### Root cause

Side Panel refresh dashboard mỗi 2,5 giây và render lại toàn bộ `viewRoot.innerHTML`. Input/textarea đang được focus vì vậy bị phá node và tạo lại, làm mất value/caret.

### Fix

Thêm form-state boundary:

- capture `input/textarea/select` có `id` ngay trước render;
- giữ value, checked state, active field và selection range;
- restore vào DOM mới sau render;
- giữ focus/caret nếu người dùng đang gõ.

Fix áp dụng cho **toàn Side Panel**, không chỉ `microscopeQueue`, nên prompt automation và các form task cũng không bị mất draft vì cùng nguyên nhân.

## 3. Action Trace — nhìn thấy Vigilume thực sự gửi như thế nào

Session Microscope có thêm **Luồng gửi lệnh**.

Trace mặc định không lưu nội dung prompt; nó chỉ giữ stage/metadata cần để audit.

### Send pipeline

```text
SEND_PRECHECK
→ SEND_COMPOSING
→ SEND_DISPATCHED
→ SEND_ACCEPTED
```

Failure/guard có thể hiện:

```text
SEND_BLOCKED
SEND_FAILED
SEND_ACK_FAILED
```

### Safe Queue pipeline

```text
QUEUE_CREATED
→ QUEUE_SCHEDULED
→ QUEUE_RECHECK
→ QUEUE_CLAIMED
→ SEND_*
→ QUEUE_EXECUTED
```

Hoặc:

```text
QUEUE_DEFERRED
QUEUE_HANDOFF
QUEUE_FAILED
QUEUE_CANCELLED
QUEUE_EXPIRED
```

### Automation pipeline

```text
AUTOMATION_TRIGGERED
→ AUTOMATION_QUEUED hoặc SEND_*
→ AUTOMATION_EXECUTED
```

Microscope cũng refresh Context Vault timeline khi đang mở thay vì chỉ đọc một lần lúc vào màn hình.

## 4. “Tự gửi khi HOÀN TẤT” ngay trong Microscope

Ô **Prompt tiếp theo** giờ có hai workflow rõ:

- **Thêm vào Safe Queue** — gửi khi session ở state an toàn (`IDLE`/`COMPLETED`);
- **Tự gửi khi HOÀN TẤT** — tạo một automation one-shot khóa vào đúng tab hiện tại.

One-shot completion rule mặc định:

- trigger: `COMPLETED`;
- target: đúng tab đang mở trong Microscope;
- delay nhỏ sau completion;
- `maxRuns = 1`;
- confidence guard;
- tự bật Automation Engine nếu đang tắt.

## 5. Automation Builder theo state hoặc theo thời gian

Trang **Tự động hóa** giờ cho chọn:

- ChatGPT tab đích;
- trigger **Sau khi thấy state** hoặc **Đúng thời gian**;
- state mục tiêu;
- `datetime-local` cho lịch hẹn;
- prompt;
- delay sau state;
- max runs;
- tùy chọn bật Automation Engine ngay sau khi lưu.

Rule list hiển thị tab đích, trigger và số lần đã chạy.

## 6. Timed automation bền vững qua service-worker restart

Time rule dùng durable scheduler hiện có:

- scheduled record trong `chrome.storage.local`;
- `chrome.alarms`;
- local timer tối ưu latency;
- single-flight execution guard;
- restore overdue rule sau service-worker restart;
- rule đã chạy/maxRuns/disabled không được schedule lại;
- nếu đổi `runAt`, scheduled action cũ tự no-op nhờ version check.

## 7. Prompt đúng giờ không chen ngang ChatGPT đang bận

Timed `send` mặc định dùng delivery mode:

```text
safe_queue
```

Tức là đến giờ hẹn, Vigilume **tạo prompt đủ điều kiện gửi**, nhưng nếu ChatGPT đang `THINKING`, `DEEP_THINKING`, `STREAMING` hoặc `TOOL_RUNNING` thì prompt nằm trong Safe Queue cho tới state an toàn.

Chỉ rule chủ động đặt `delivery: direct` mới cố gửi thẳng.

Điều này giữ tính hữu ích của lịch hẹn mà không phá nguyên tắc “không chen ngang turn đang chạy”.

## 8. Regression/verification additions

Thêm test cho:

- completion settle single-timer + changed-candidate cancellation;
- form draft/focus/caret preservation qua whole-view rerender;
- privacy-safe bounded action trace;
- durable time automation due calculation;
- overdue one-shot restore;
- timed send defaults to Safe Queue delivery.

Release vẫn phải qua:

```bash
npm test
npm run verify
npm run package
sha256sum -c dist/SHA256SUMS.txt
```

với 39 MCP tools giữ nguyên.

## Cách kiểm tra nhanh sau khi nâng cấp

1. Mở một ChatGPT trong Session Microscope.
2. Gõ vào **Prompt tiếp theo** và chờ hơn 5–10 giây — text không được tự biến mất.
3. Để ChatGPT trả lời xong — `COMPLETING` chỉ tồn tại ngắn trong settle window rồi phải lên `COMPLETED` nếu completion evidence ổn định.
4. Trước khi turn xong, nhập prompt và bấm **Tự gửi khi HOÀN TẤT**.
5. Quan sát **Luồng gửi lệnh** để thấy automation/queue/send stages.
6. Vào **Tự động hóa**, chọn tab → `Đúng thời gian` → đặt thời gian tương lai → prompt → lưu.
7. Nếu đến giờ mà ChatGPT đang bận, prompt phải vào Safe Queue thay vì chen ngang.

## Giới hạn kiểm chứng

Các regression/unit/static tests xác nhận logic và wiring của các fix trên. ChatGPT Web vẫn thay đổi theo account/model/UI rollout, vì vậy live E2E trên tài khoản cụ thể của người dùng vẫn là bước quan trọng để xác nhận selector/evidence với rollout thực tế.

---

**Vigilume là phần mềm độc lập, không liên kết hay được OpenAI chứng thực. Xem `DISCLAIMER.md` trước khi bật automation hoặc cấp quyền cho AI agent.**
